import json
import random
import uuid
from datetime import datetime, timedelta
from bson import ObjectId
from faker import Faker

fake = Faker('pt_BR')

def random_date(start_days_ago=365, end_days_ago=0):
    start = datetime.now() - timedelta(days=start_days_ago)
    end = datetime.now() - timedelta(days=end_days_ago)
    return fake.date_time_between(start_date=start, end_date=end).isoformat() + "Z"

# Produto base será montado com dados do histórico de compra
def gerar_cliente_e_coletar_produtos(id_num, produtos_usados):
    collections = ["INVERNO 2025", "VERÃO 2025", "OUTONO 2024", "PRIMAVERA 2025"]
    categories = ["Casual", "Esportivo", "Formal", "Praia", "Festa"]
    colors = ["Verde", "Azul", "Vermelho", "Preto", "Branco", "Amarelo", "Cinza"]
    sizes = ["PP", "P", "M", "G", "GG", "XG"]
    product_types = ["Fitness", "Moda Praia", "Casual", "Formal", "Esportivo"]

    cliente_id = f"cliente-{fake.word()}-{id_num}"
    nome_cliente = f"Cliente {fake.first_name()}"
    telefone = "55" + "9" * random.randint(10, 12)
    purchase_count = random.randint(1, 3)

    purchase_history = []
    for i in range(purchase_count):
        sku = f"sku-{fake.word()}-{id_num}-{i}"
        size = random.choice(sizes)
        color = random.choice(colors)
        collection = random.choice(collections)
        category = random.choice(categories)
        product_name = fake.word().capitalize() + " " + random.choice(["moletom", "camiseta", "jaqueta", "calça", "blusa"])
        product_id = f"product-id-{id_num}-{i}"
        price = round(random.uniform(29.9, 199.9), 2)

        # Adiciona ao histórico do cliente
        purchase_history.append({
            "sku": sku,
            "size": size,
            "productColor": color,
            "collection": collection,
            "category": category,
            "productName": product_name,
            "productId": product_id,
            "price": price,
            "quantity": random.randint(1, 3),
            "paymentMethod": random.choice(["pix", "cartão", "boleto"]),
            "purchaseDate": {
                "$date": random_date()
            }
        })

        # Garante que cada produto seja adicionado uma vez com informações completas
        if sku not in produtos_usados:
            produtos_usados[sku] = {
                "_id": {
                    "$oid": str(ObjectId())
                },
                "storeId": {
                    "$oid": str("682e747771883dd79b52c3c9")
                },
                "productId": str(ObjectId()),
                "sku": sku,
                "size": size,
                "color": color,
                "category": category,
                "collection": collection,
                "productType": random.choice(product_types),
                "productName": product_name,
                "productUuid": str(uuid.uuid4()),
                "stockQuantity": random.randint(0, 50),
                "price": price,
                "imageUrl": f"https://example.com/public/{product_name.lower().replace(' ', '-')}.png"
            }

    cliente = {
        "_id": {
            "$oid": str(ObjectId())
        },
        "storeId": "682e7777e5e99eb035208e2f",
        "externalId": cliente_id,
        "name": nome_cliente,
        "phone": telefone,
        "active": False,
        "purchaseHistory": purchase_history
    }

    return cliente


if __name__ == "__main__":
    lista_clientes = []
    produtos_unicos = {}

    for i in range(1, 6):
        cliente = gerar_cliente_e_coletar_produtos(i, produtos_unicos)
        lista_clientes.append(cliente)

    # Salvar clientes
    with open("clientes_fake.json", "w", encoding="utf-8") as f:
        json.dump(lista_clientes, f, ensure_ascii=False, indent=2)

    # Salvar produtos únicos extraídos dos históricos
    with open("produtos_fake.json", "w", encoding="utf-8") as f:
        json.dump(list(produtos_unicos.values()), f, ensure_ascii=False, indent=2)

    print("Arquivos 'clientes_fake.json' e 'produtos_fake.json' gerados com sucesso.")
