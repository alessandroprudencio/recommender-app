# Importações
import pandas as pd
from sklearn.preprocessing import LabelEncoder
import lightgbm as lgb
from pymongo import MongoClient
from datetime import datetime
from bson import ObjectId
from dotenv import load_dotenv
import os
import random

load_dotenv()
database_url = os.getenv('DATABASE_URL')

client = MongoClient(database_url)
db = client['whatsappRecommendationDB']

# Coleções
clients_collection = db['clients']
products_collection = db['products']
purchases_collection = db['purchases']  # ← NOVO
recommendations_collection = db['client_recommendations']

store_id = ObjectId("682e7777e5e99eb035208e2f")

# Busca dados do Mongo
def get_mongo_data():
    clients = list(clients_collection.find())
    products = list(products_collection.find())
    all_products = {prod['sku']: prod for prod in products}
    return clients, all_products

# Função para buscar compras de um cliente
def get_purchase_history_by_client(client_id):
    return list(purchases_collection.find({'clientId': client_id}))

# Monta dataset de treino
def build_training_data(clients_sample, all_products):
    data_list = []
    for client in clients_sample:
        clientId = client.get('_id')
        clientExternalId = client.get('externalId')
        purchased_skus = set()

        purchase_history = get_purchase_history_by_client(clientId)

        for purchase in purchase_history:
            if not purchase or 'items' not in purchase:
                continue
            for item in purchase['items']:
                sku = item.get('sku')
                if sku and sku in all_products:
                    purchased_skus.add(sku)

        for sku, product in all_products.items():
            data_list.append({
                'clientId': clientId,
                'clientExternalId': clientExternalId,
                'sku': sku,
                'category': product.get('category'),
                'productColor': product.get('color'),
                'collection': product.get('collection'),
                'productName': product.get('productName'),
                'productType': product.get('productType'),
                'productId': str(product.get('_id')),
                'size': product.get('size'),
                'bought': 1 if sku in purchased_skus else 0,
                'stockQuantity': product.get('stockQuantity', 0)
            })

    df = pd.DataFrame(data_list)
    df['stockQuantity'] = df['stockQuantity'].fillna(0).astype(int)
    return df

# Treina o modelo
def train_model(df):
    encoders = {
        'client': LabelEncoder(),
        'sku': LabelEncoder(),
        'category': LabelEncoder(),
        'color': LabelEncoder(),
        'collection': LabelEncoder(),
        'size': LabelEncoder()
    }

   # Limpa valores ausentes e converte para string onde necessário
    df['category'] = df['category'].fillna('').astype(str)
    df['productColor'] = df['productColor'].fillna('').astype(str)
    df['collection'] = df['collection'].fillna('').astype(str)
    df['size'] = df['size'].fillna('').astype(str)

    # Aplica a codificação nas colunas relevantes
    df['externalId_enc'] = encoders['client'].fit_transform(df['clientExternalId'])
    df['sku_enc'] = encoders['sku'].fit_transform(df['sku'])
    df['category_enc'] = encoders['category'].fit_transform(df['category'])
    df['productColor_enc'] = encoders['color'].fit_transform(df['productColor'])
    df['collection_enc'] = encoders['collection'].fit_transform(df['collection'])
    df['size_enc'] = encoders['size'].fit_transform(df['size'])

    features = ['externalId_enc', 'sku_enc', 'category_enc', 'productColor_enc', 'collection_enc', 'size_enc']
    target = 'bought'

    model = lgb.LGBMClassifier()
    model.fit(df[features], df[target])

    return model, encoders, features

# Transformação segura
def safe_transform(encoder, values):
    known = set(encoder.classes_)
    return [encoder.transform([v])[0] if v in known else -1 for v in values]

# Geração de recomendações
def recommend_for_client(client, all_products, model, encoders, features):
    clientId = client.get('_id')
    clientExternalId = client.get('externalId')
    purchased_skus = set()

    purchase_history = get_purchase_history_by_client(clientId)

    for purchase in purchase_history:
        for item in purchase.get('items', []):
            sku = item.get('sku')
            if sku and sku in all_products:
                purchased_skus.add(sku)

    data_list = []
    for sku, product in all_products.items():
        data_list.append({
            'clientId': clientId,
            'clientExternalId': clientExternalId,
            'sku': sku,
            'category': product.get('category'),
            'productColor': product.get('color'),
            'collection': product.get('collection'),
            'productName': product.get('productName'),
            'productType': product.get('productType'),
            'productId': str(product.get('_id')),
            'size': product.get('size'),
            'bought': 1 if sku in purchased_skus else 0,
            'stockQuantity': product.get('stockQuantity', 0)
        })

    df_client = pd.DataFrame(data_list)
    df_client['stockQuantity'] = df_client['stockQuantity'].fillna(0).astype(int)

    if len(purchased_skus) == 0:
        print(f"[SKIP] Cliente {clientId} sem histórico de compras")
        return

    try:
        df_client['externalId_enc'] = safe_transform(encoders['client'], df_client['clientExternalId'])
        df_client['sku_enc'] = safe_transform(encoders['sku'], df_client['sku'])
        df_client['category_enc'] = safe_transform(encoders['category'], df_client['category'])
        df_client['productColor_enc'] = safe_transform(encoders['color'], df_client['productColor'])
        df_client['collection_enc'] = safe_transform(encoders['collection'], df_client['collection'])
        df_client['size_enc'] = safe_transform(encoders['size'], df_client['size'])
    except Exception as e:
        print(f"[ERROR] Encoding falhou para cliente {clientId}: {e}")
        return

    strategies = [
        ('category', list(set(df_client[df_client['bought'] == 1]['category']))),
        ('collection', list(set(df_client[df_client['bought'] == 1]['collection']))),
        ('productColor', list(set(df_client[df_client['bought'] == 1]['productColor']))),
        ('popular', df_client[df_client['bought'] == 1]['sku'].value_counts().head(10).index.tolist())
    ]

    recommendations = pd.DataFrame()
    for strategy, values in strategies:
        if strategy == 'popular':
            filter_condition = (
                (df_client['sku'].isin(values)) &
                (df_client['bought'] == 0) &
                (df_client['stockQuantity'] > 0)
            )
        else:
            filter_condition = (
                (df_client[strategy].isin(values)) &
                (df_client['bought'] == 0) &
                (df_client['stockQuantity'] > 0)
            )
        recommendations = df_client[filter_condition]
        if not recommendations.empty:
            break

    if recommendations.empty:
        print(f"[WARNING] Cliente {clientId} sem produtos recomendáveis")
        return

    recommendations = recommendations.copy()
    recommendations = recommendations[(recommendations[features] != -1).all(axis=1)]

    if recommendations.empty:
        print(f"[WARNING] Cliente {clientId} sem produtos válidos após encoding")
        return

    recommendations['score'] = model.predict_proba(recommendations[features])[:, 1]
    top_recommendations = recommendations.nlargest(5, 'score')

    formatted_recommendations = []
    for _, row in top_recommendations.iterrows():
        formatted_recommendations.append({
            "productId": ObjectId(row['productId']),
            "score": float(row['score']),
            "sku": row['sku'],
            "quantity": int(row['stockQuantity']),
            "snapshot": {
                key: row[key] for key in [
                    'productName', 'productColor', 'size',
                    'productType', 'category', 'collection'
                ]
            }
        })

    recommendations_collection.insert_one({
        "storeId": store_id,
        "clientId": clientId,
        "recommendedProducts": formatted_recommendations,
        "processedAt": datetime.now()
    })

    print(f"Recomendações salvas para {clientId}")

# Função principal
def main():
    clients, all_products = get_mongo_data()

    sample_size = 2000
    if len(clients) > sample_size:
        clients_sample = random.sample(clients, sample_size)
    else:
        clients_sample = clients

    print("Construindo DataFrame para treino (amostra)...")
    df_train = build_training_data(clients_sample, all_products)

    print("Treinando modelo...")
    model, encoders, features = train_model(df_train)

    print("Gerando recomendações para todos clientes...")
    for client in clients:
        recommend_for_client(client, all_products, model, encoders, features)

if __name__ == "__main__":
    main()
