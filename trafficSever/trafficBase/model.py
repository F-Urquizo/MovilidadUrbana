# model.py

from mesa import Model
from mesa.time import RandomActivation
from mesa.space import MultiGrid
from .agent import *
import json
import random
import os

class CityModel(Model):
    """ 
    Crea un modelo basado en un mapa de la ciudad.

    Args:
        N: Número de agentes (coches) en la simulación
    """
    def __init__(self, N):

        super().__init__()  # Inicializa la clase base Model

        # Obtener la ruta del directorio actual (donde está este script)
        script_dir = os.path.dirname(os.path.abspath(__file__))

        # Construir la ruta al archivo mapDictionary.json
        dictionary_path = os.path.join(script_dir, "city_files", "mapDictionary.json")

        # Verificar si el archivo existe
        if not os.path.exists(dictionary_path):
            raise FileNotFoundError(f"No se encontró el archivo de diccionario en {dictionary_path}")

        # Cargar el diccionario de mapeo del mapa
        with open(dictionary_path, 'r', encoding='utf-8') as f:
            dataDictionary = json.load(f)

        self.traffic_lights = []
        self.cars = []
        self.destinations = []
        self.obstacles = []  # Lista para almacenar obstáculos

        # Construir la ruta al archivo de mapa
        map_path = os.path.join(script_dir, "city_files", "2022_base.txt")

        # Verificar si el archivo existe
        if not os.path.exists(map_path):
            raise FileNotFoundError(f"No se encontró el archivo de mapa en {map_path}")

        # Cargar el archivo de mapa
        with open(map_path, 'r', encoding='utf-8') as baseFile:
            lines = baseFile.readlines()
            self.width = len(lines[0].strip())
            self.height = len(lines)
            self.grid = MultiGrid(self.width, self.height, torus=False) 
            self.schedule = RandomActivation(self)

            print(f"Dimensiones del mapa: ancho={self.width}, alto={self.height}")

            # Crear agentes según el mapa
            for r, row in enumerate(lines):
                row = row.strip()
                for c, col in enumerate(row):
                    pos = (c, self.height - r - 1)
                    print(f"Procesando carácter '{col}' en posición ({c}, {r}), coordenadas {pos}")
                    if col in ["v", "^", ">", "<"]:
                        direction = dataDictionary[col]
                        agent = Road(f"r_{r*self.width+c}", self, direction)
                        self.grid.place_agent(agent, pos)
                        print(f"Road creado en posición {pos} con dirección {direction}")
                    elif col in ["S", "s"]:
                        timeToChange = int(dataDictionary[col])
                        state = False if col == "S" else True
                        agent = Traffic_Light(
                            f"tl_{r*self.width+c}",
                            self,
                            state=state,
                            timeToChange=timeToChange
                        )
                        self.grid.place_agent(agent, pos)
                        self.schedule.add(agent)
                        self.traffic_lights.append(agent)
                        print(f"Traffic Light creado en posición {pos} con estado {'Red' if not agent.state else 'Green'}")
                    elif col == "#":
                        agent = Obstacle(f"ob_{r*self.width+c}", self)
                        self.grid.place_agent(agent, pos)
                        self.obstacles.append(agent)
                        print(f"Obstáculo creado en posición {pos}")
                    elif col == "D":
                        agent = Destination(f"d_{r*self.width+c}", self)
                        self.grid.place_agent(agent, pos)
                        self.destinations.append(agent)
                        print(f"Destination creado en posición {pos}")
                    else:
                        print(f"Carácter desconocido '{col}' en posición ({c}, {r})")

        # Verificar que hay suficientes destinos
        if N > len(self.destinations):
            raise ValueError("El número de coches excede el número de destinos.")

        # Barajar destinos para asignar aleatoriamente
        random.shuffle(self.destinations)

        # Definir las cuatro posiciones de inicio
        starting_positions = [
            (0, 0),
            (0, self.height - 1),
            (self.width - 1, 0),
            (self.width - 1, self.height - 1)
        ]

        # Validar que las posiciones de inicio estén en carreteras
        for pos in starting_positions:
            agents_at_pos = self.grid.get_cell_list_contents([pos])
            if not any(isinstance(agent, Road) for agent in agents_at_pos):
                raise ValueError(f"La posición de inicio {pos} no contiene un agente Road.")
            else:
                print(f"Posición de inicio válida: {pos}")

        # Crear agentes Car y asignar destinos aleatorios
        for i in range(N):
            start_pos = starting_positions[i % len(starting_positions)]
            random_destination = random.choice(self.destinations)
            carAgent = Car(
                unique_id=f"car_{i+1}", 
                model=self, 
                destination_pos=(random_destination.pos[0], random_destination.pos[1])
            )
            self.grid.place_agent(carAgent, start_pos)
            self.schedule.add(carAgent)
            self.cars.append(carAgent)
            print(f"Car {carAgent.unique_id} creado en posición {start_pos} con destino {carAgent.destination_pos}")

        self.num_agents = N
        self.running = True

        # Mostrar el número total de obstáculos creados
        print(f"Número total de obstáculos creados: {len(self.obstacles)}")

    def step(self):
        '''Avanza el modelo en un paso.'''
        self.schedule.step()
