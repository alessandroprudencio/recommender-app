import json
import random
from datetime import datetime, timedelta
from bson import ObjectId  
from faker import Faker

fake = Faker('pt_BR')

def random_date(start_days_ago=365, end_days_ago=0):
    start = datetime.now() - timedelta(days=start_days_ago)
    end = datetime.now() - timedelta(days=end_days_ago)
    return fake.date_time_between(start_date=start, end_date=end).isoformat() + "Z"

def gerar_cliente(id_num):
    collections = ["INVERNO 2025", "VERÃO 2025", "OUTONO 2024", "PRIMAVERA 2025"]
    categories = ["Casual", "Esportivo", "Formal", "Praia", "Festa"]
    colors = ["Verde", "Azul", "Vermelho", "Preto", "Branco", "Amarelo", "Cinza"]
    sizes = ["PP", "P", "M", "G", "GG", "XG"]

    cliente_id = f"cliente-{fake.word()}-{id_num}"
    nome_cliente = f"Cliente {fake.first_name()}"
    telefone = "55" + "9" * random.randint(10, 12)  # vários noves (9's)
    purchase_count = random.randint(1, 3)

    purchase_history = []
    for i in range(purchase_count):
        sku = f"sku-{fake.word()}-{id_num}-{i}"
        product_name = fake.word().capitalize() + " " + random.choice(["moletom", "camiseta", "jaqueta", "calça", "blusa"])
        purchase_history.append({
            "sku": sku,
            "size": random.choice(sizes),
            "productColor": random.choice(colors),
            "collection": random.choice(collections),
            "category": random.choice(categories),
            "productName": product_name,
            "productId": f"product-id-{id_num}-{i}",
            "price": round(random.uniform(29.9, 199.9), 2),
            "quantity": random.randint(1, 3),
            "paymentMethod": random.choice(["pix", "cartão", "boleto"]),
            "purchaseDate": {
                "$date": random_date()
            }
        })

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
    lista_clientes = [gerar_cliente(i) for i in range(1, 6)]  # 5 clientes fake

    # Salvar em arquivo JSON
    with open("clientes_fake.json", "w", encoding="utf-8") as f:
        json.dump(lista_clientes, f, ensure_ascii=False, indent=2)

    print("Arquivo clientes_fake.json gerado com sucesso.")
