import json

path = r'c:\Users\DELL\Documents\OpenCode\ampf-website\data\content.json'
with open(path, encoding='utf-8') as f:
    data = json.load(f)

assert data['mgfContent']['about']['intro']['fr'] == "Le Centre d'Excellence pour l'Élimination des MGF a été créé pour répondre à un besoin urgent : unir les efforts et partager les expertises à l'échelle mondiale pour éradiquer les MGF. Basé en Mauritanie et porté par IPPF et de ses partenaires."
assert data['mgfContent']['mandat']['fr'] == "Accompagner les associations membres de l'IPPF, les gouvernements et la société civile en fournissant une expertise technique, des données probantes et des formations."
assert data['mgfContent']['valeurAjoutee']['fr'] == "Une approche centrée sur les survivantes, une expertise de terrain et une capacité à mobiliser les acteurs à l'échelle internationale."
assert data['mgfContent']['mission']['fr'] == "Stimuler la recherche, les médias et les programmes éducatifs/formation ; fournir des conseils sur des services de soins de haute qualité ; développer des preuves et mobiliser les énergies pour contribuer à l'élimination des MGF dans le monde, dans des conditions normales comme dans des contextes humanitaires."
assert data['mgfContent']['vision']['fr'] == "Un monde où les filles et les femmes vivent à l'abri de toutes les formes de violence sexuelle et basée sur le genre, y compris les MGF, et où leurs droits sexuels et reproductifs sont pleinement respectés."
assert data['mgfContent']['globalReach']['ctas'][0]['fr'] == "Découvrir notre mission"
assert data['mgfContent']['globalReach']['ctas'][1]['fr'] == "Rejoindre le réseau"
print('JSON + FR content OK')
