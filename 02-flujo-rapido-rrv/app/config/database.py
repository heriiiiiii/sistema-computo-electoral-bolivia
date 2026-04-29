from pymongo import MongoClient
from app.config.settings import MONGO_URI, MONGO_DB_NAME

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = client[MONGO_DB_NAME]

def get_database():
    return db

def get_collection(collection_name: str):
    return db[collection_name]

def check_mongodb_connection():
    client.admin.command("ping")
    status = client.admin.command("replSetGetStatus")

    members = []
    for member in status.get("members", []):
        members.append({
            "name": member.get("name"),
            "state": member.get("stateStr"),
            "health": member.get("health")
        })

    return {
        "status": "OK",
        "database": MONGO_DB_NAME,
        "replicaSet": status.get("set"),
        "members": members
    }
