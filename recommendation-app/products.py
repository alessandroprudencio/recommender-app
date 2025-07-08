import json
import random
import uuid
from bson import ObjectId
from faker import Faker

fake = Faker('pt_BR')

def gerar_produto(id_num):
    collections = ["Verão 2023", "Inverno 2025", "Outono 2024", "Primavera 2025"]
    categories = ["Casual", "Fitness", "Esportivo", "Formal", "Praia"]
    colors = ["Branco", "Preto", "Azul", "Vermelho", "Cinza", "Verde", "Amarelo"]
    product_types = ["Fitness", "Moda Praia", "Casual", "Formal", "Esportivo"]
    sizes = ["PP", "P", "M", "G", "GG", "XG"]
    
    size = random.choice(sizes)
    color = random.choice(colors)
    category = random.choice(categories)
    collection = random.choice(collections)
    product_type = random.choice(product_types)
    product_name = f"{random.choice(['Camiseta', 'Calça', 'Jaqueta', 'Moletom', 'Blusa'])} {category} {color}"
    
    produto = {
        "_id": {
            "$oid": str(ObjectId())
        },
        "storeId": "682e747771883dd79b52c3c9",
        "productId": str(ObjectId()),
        "sku": f"SKU{id_num:04d}",
        "size": size,
        "color": color,
        "category": category,
        "collection": collection,
        "productType": product_type,
        "productName": product_name,
        "productUuid": str(uuid.uuid4()),
        "stockQuantity": random.randint(0, 100),
        "price": round(random.uniform(20.0, 250.0), 2),
        "imageUrl": f"https://example.com/public/{product_name.lower().replace(' ', '-')}.png"
    }
    
    return produto


if __name__ == "__main__":
    produtos = [gerar_produto(i) for i in range(1, 11)]  # 10 produtos fake
    
    with open("produtos_fake.json", "w", encoding="utf-8") as f:
        json.dump(produtos, f, ensure_ascii=False, indent=2)
    
    print("Arquivo produtos_fake.json gerado com sucesso.")
