from datetime import datetime
from bson import ObjectId

def serialize_mongo_document(document):
    if document is None:
        return None

    result = {}

    for key, value in document.items():
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, list):
            result[key] = [
                serialize_mongo_document(item) if isinstance(item, dict) else item
                for item in value
            ]
        elif isinstance(value, dict):
            result[key] = serialize_mongo_document(value)
        else:
            result[key] = value

    return result

def serialize_mongo_documents(documents):
    return [serialize_mongo_document(document) for document in documents]
