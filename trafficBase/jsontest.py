import json

data = json.load(open("city_files/mapDictionary.json"))

print(data['<'])
print(data['>'])
print(data['^'])
print(data['v'])
# # Accessing specific elements
# print("Right is represented by:", data.get(">"))
# print("Destination is represented by:", data.get("D"))
