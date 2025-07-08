package main

import (
	"context"
	"log"
	"math"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

const batchSize = 2000

type Company struct {
	ID   primitive.ObjectID `bson:"_id,omitempty"`
	Name string             `bson:"name"`
}

type Store struct {
	ID        primitive.ObjectID `bson:"_id,omitempty"`
	CompanyID primitive.ObjectID `bson:"companyId"`
	Name      string             `bson:"name"`
	RFVRules  *RFVRules          `bson:"rfvRules,omitempty"` // pode ser nil
}

type Client struct {
	ID              primitive.ObjectID `bson:"_id,omitempty"`
	StoreID         primitive.ObjectID `bson:"storeId"`
	PurchaseHistory []Purchase         `bson:"purchaseHistory"`
}

type Purchase struct {
	PurchaseDate primitive.DateTime `bson:"purchaseDate"`
	Items        []Item             `bson:"items"`
}

type Item struct {
	Price    float64 `bson:"price"`
	Quantity int     `bson:"quantity"`
}

type RFVRule struct {
	Min   float64  `bson:"min"`
	Max   *float64 `bson:"max,omitempty"` // agora um ponteiro, omitido se nil
	Score int      `bson:"score"`
}

type RFVRules struct {
	Recency   []RFVRule `bson:"recency"`
	Frequency []RFVRule `bson:"frequency"`
	Value     []RFVRule `bson:"value"`
}

type RFVData struct {
	Recency             int       `bson:"recency"`
	Frequency           int       `bson:"frequency"`
	Value               float64   `bson:"value"`
	RScore              int       `bson:"rScore"`
	FScore              int       `bson:"fScore"`
	VScore              int       `bson:"vScore"`
	TotalScore          int       `bson:"totalScore"`
	ClassificationLabel string    `bson:"classificationLabel"`
	CalculatedAt        time.Time `bson:"calculatedAt"`
}

func main() {
	ctx := context.TODO()

	mongoURI := os.Getenv("DATABASE_URL")
	if mongoURI == "" {
		log.Fatal("DATABASE_URL não está definida")
	}

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		log.Fatal("Erro ao conectar ao MongoDB:", err)
	}
	defer func() {
		if err := client.Disconnect(ctx); err != nil {
			log.Println("Erro ao desconectar do MongoDB:", err)
		}
	}()

	if err := client.Ping(ctx, readpref.Primary()); err != nil {
		log.Fatal("Não conseguiu pingar MongoDB:", err)
	}

	db := client.Database("whatsappRecommendationDB")

	calculateRFV(db)
}

func calculateRFV(db *mongo.Database) {
	ctx := context.TODO()

	companiesCollection := db.Collection("companies")
	storesCollection := db.Collection("stores")
	clientsCollection := db.Collection("clients")

	var companies []Company
	curCompanies, err := companiesCollection.Find(ctx, bson.M{})
	if err != nil {
		log.Fatal("Erro ao buscar companies:", err)
	}
	if err := curCompanies.All(ctx, &companies); err != nil {
		log.Fatal("Erro ao decodificar companies:", err)
	}

	log.Printf("Encontradas %d empresas para processar.", len(companies))

	for _, company := range companies {
		log.Printf("Iniciando cálculo RFV para empresa: %s (%s)", company.Name, company.ID.Hex())

		var stores []Store
		curStores, err := storesCollection.Find(ctx, bson.M{"companyId": company.ID})
		if err != nil {
			log.Printf("Erro ao buscar lojas para empresa %s: %v", company.Name, err)
			continue
		}
		if err := curStores.All(ctx, &stores); err != nil {
			log.Printf("Erro ao decodificar lojas para empresa %s: %v", company.Name, err)
			continue
		}

		log.Printf("Empresa %s tem %d lojas", company.Name, len(stores))

		for _, store := range stores {
			if store.RFVRules == nil {
				log.Printf("  Loja '%s' não tem regras RFV, pulando...", store.Name)
				continue
			}

			log.Printf("  Processando loja: %s (%s)", store.Name, store.ID.Hex())

			var lastID primitive.ObjectID
			totalClientsProcessed := 0
			for {
				filter := bson.M{"storeId": store.ID}
				if !lastID.IsZero() {
					filter["_id"] = bson.M{"$gt": lastID}
				}

				curClients, err := clientsCollection.Find(ctx, filter, options.Find().
					SetSort(bson.M{"_id": 1}).
					SetLimit(batchSize))
				if err != nil {
					log.Printf("Erro ao buscar clientes para loja %s: %v", store.Name, err)
					break
				}

				var clientsBatch []Client
				if err := curClients.All(ctx, &clientsBatch); err != nil {
					log.Printf("Erro ao decodificar clientes para loja %s: %v", store.Name, err)
					break
				}

				if len(clientsBatch) == 0 {
					log.Printf("  Nenhum cliente restante para processar na loja %s", store.Name)
					break
				}

				log.Printf("  Processando batch de %d clientes na loja %s", len(clientsBatch), store.Name)

				for _, client := range clientsBatch {
					rfvData := calculateClientRFVWithRules(client, *store.RFVRules)

					if err := updateClientRFV(ctx, db, client, rfvData); err != nil {
						log.Printf("Erro ao atualizar cliente %s: %v", client.ID.Hex(), err)
					}
				}

				totalClientsProcessed += len(clientsBatch)
				lastID = clientsBatch[len(clientsBatch)-1].ID
			}

			log.Printf("  Finalizado processamento da loja %s, total de clientes processados: %d", store.Name, totalClientsProcessed)
		}

		log.Printf("Finalizado cálculo RFV para empresa: %s", company.Name)
	}
}

func calculateClientRFVWithRules(client Client, rules RFVRules) RFVData {
	var purchaseDates []time.Time
	var valueTotal float64

	for _, purchase := range client.PurchaseHistory {
		date := purchase.PurchaseDate.Time()
		if !date.IsZero() {
			purchaseDates = append(purchaseDates, date)
		}
		for _, item := range purchase.Items {
			valueTotal += item.Price * float64(item.Quantity)
		}
	}

	frequency := len(client.PurchaseHistory)
	value := math.Round(valueTotal*100) / 100

	var recency int
	if len(purchaseDates) > 0 {
		lastPurchase := latestPurchaseDate(purchaseDates)
		recency = int(math.Max(0, time.Since(lastPurchase).Hours()/24))
	}

	return scoreRFVWithRules(RFVData{
		Recency:   recency,
		Frequency: frequency,
		Value:     value,
	}, rules)
}

func parsePurchaseDate(dateStr string) time.Time {
	t, err := time.Parse(time.RFC3339, dateStr)
	if err != nil {
		return time.Time{}
	}
	return t
}

func latestPurchaseDate(dates []time.Time) time.Time {
	latest := dates[0]
	for _, d := range dates[1:] {
		if d.After(latest) {
			latest = d
		}
	}
	return latest
}

func scoreRFVWithRules(data RFVData, rules RFVRules) RFVData {
	data.RScore = scoreFromRules(float64(data.Recency), rules.Recency, true)
	data.FScore = scoreFromRules(float64(data.Frequency), rules.Frequency, false)
	data.VScore = scoreFromRules(data.Value, rules.Value, false)
	data.TotalScore = data.RScore + data.FScore + data.VScore
	data.ClassificationLabel = classifyRFV(data)
	data.CalculatedAt = time.Now().UTC()
	return data
}

func scoreFromRules(value float64, rules []RFVRule, lowerIsBetter bool) int {
	for _, r := range rules {
		// verifica limite inferior
		if value < r.Min {
			continue
		}
		// aceita tudo acima de Min se Max for nil, senão testa <= Max
		if r.Max == nil || value <= *r.Max {
			return r.Score
		}
	}
	// se não casar em nenhuma faixa, retorna score mínimo
	return 1
}

func classifyRFV(data RFVData) string {
	// Se o cliente não possui compras, consideramos como inativo
	if data.Frequency == 0 {
		return "inactive"
	}

	// Classificação baseada no TotalScore (R + F + V)
	switch {
	case data.TotalScore >= 12:
		return "excellent" // Cliente com comportamento excelente
	case data.TotalScore >= 9:
		return "good" // Cliente com bom comportamento
	case data.TotalScore >= 6:
		return "average" // Cliente com comportamento médio
	default:
		return "weak" // Cliente com comportamento fraco
	}
}

func updateClientRFV(ctx context.Context, db *mongo.Database, client Client, rfvData RFVData) error {
	clientsCollection := db.Collection("clients")
	historyCollection := db.Collection("client_rfv_history")

	// Atualiza o RFV atual do cliente
	update := bson.M{
		"$set": bson.M{
			"rfv":                    rfvData,
			"rfvClassificationLabel": rfvData.ClassificationLabel,
		},
	}
	_, err := clientsCollection.UpdateByID(ctx, client.ID, update)
	if err != nil {
		return err
	}

	// Salva o histórico
	historyDoc := bson.M{
		"clientId":               client.ID,
		"storeId":                client.StoreID,
		"recency":                rfvData.Recency,
		"frequency":              rfvData.Frequency,
		"value":                  rfvData.Value,
		"rScore":                 rfvData.RScore,
		"fScore":                 rfvData.FScore,
		"vScore":                 rfvData.VScore,
		"totalScore":             rfvData.TotalScore,
		"rfvClassificationLabel": rfvData.ClassificationLabel,
		"calculatedAt":           rfvData.CalculatedAt,
	}
	_, err = historyCollection.InsertOne(ctx, historyDoc)
	return err
}
