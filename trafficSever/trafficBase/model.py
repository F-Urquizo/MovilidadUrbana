# trafficBase/model.py

import os
from mesa import Model
from mesa.time import RandomActivation
from mesa.space import MultiGrid
from agent import Road, Traffic_Light, Obstacle, Destination, Car
import json
import random

class CityModel(Model):
    """ 
        Crea un modelo basado en un mapa de ciudad.

        Args:
            N: Número de agentes (coches) en la simulación
    """
    def __init__(self, N):
        super().__init__()

        # Obtener la ruta absoluta del directorio actual (donde está model.py)
        current_dir = os.path.dirname(os.path.abspath(__file__))

        # Construir la ruta al archivo mapDictionary.json
        map_dict_path = os.path.join(current_dir, '..', 'city_files', 'mapDictionary.json')

        # Construir la ruta al archivo del mapa
        map_file_path = os.path.join(current_dir, '..', 'city_files', 'concurso.txt')

        # Cargar el diccionario del mapa con manejo de errores
        try:
            with open(map_dict_path) as f:
                dataDictionary = json.load(f)
            print(f"mapDictionary.json cargado desde {map_dict_path}")
        except FileNotFoundError:
            print(f"Error: No se encontró el archivo {map_dict_path}. Asegúrate de que el archivo exista.")
            raise
        except json.JSONDecodeError as e:
            print(f"Error al parsear {map_dict_path}: {e}")
            raise

        self.traffic_lights = []
        self.cars = []
        self.destinations = []
        self.obstacles = []  # Añadir esta línea para inicializar el atributo obstacles
        self.step_count = 0
        self.num_cars = N
        self.unique_id = 0

        # Cargar el archivo del mapa con manejo de errores
        try:
            with open(map_file_path) as baseFile:
                lines = baseFile.readlines()
            print(f"Mapa cargado desde {map_file_path}")
        except FileNotFoundError:
            print(f"Error: No se encontró el archivo {map_file_path}. Asegúrate de que el archivo exista.")
            raise
        except Exception as e:
            print(f"Error al leer {map_file_path}: {e}")
            raise

        self.width = len(lines[0].strip())  # Asegurar que no hay un salto de línea final que afecte el ancho
        self.height = len(lines)
        self.grid = MultiGrid(self.width, self.height, torus=False) 
        self.schedule = RandomActivation(self)

        # Recopilar todas las posiciones de carreteras para validación
        road_positions = []

        # Recorre cada carácter en el archivo del mapa y crea el agente correspondiente.
        for r, row in enumerate(lines):
            for c, col in enumerate(row.strip()):
                pos = (c, self.height - r - 1)  # El eje y de Mesa comienza en la parte inferior
                if col in ["v", "^", ">", "<"]:
                    agent = Road(f"r_{r*self.width+c}", self, dataDictionary[col])
                    self.grid.place_agent(agent, pos)
                    road_positions.append(pos)

                elif col in ["S", "s"]:
                    agent = Traffic_Light(
                        f"tl_{r*self.width+c}", 
                        self, 
                        state=False if col == "S" else True, 
                        timeToChange=int(dataDictionary[col])
                    )
                    self.grid.place_agent(agent, pos)
                    self.schedule.add(agent)
                    self.traffic_lights.append(agent)

                elif col == "#":
                    agent = Obstacle(f"ob_{r*self.width+c}", self)
                    self.grid.place_agent(agent, pos)
                    self.obstacles.append(agent)  # Añadir el obstáculo a self.obstacles

                elif col == "D":
                    agent = Destination(f"d_{r*self.width+c}", self)
                    self.grid.place_agent(agent, pos)
                    self.destinations.append(agent)

        # Mezclar destinos para asignar aleatoriamente (opcional si se codifica)
        random.shuffle(self.destinations)

        # Definir las cuatro posiciones de inicio
        self.starting_positions = [
            (0, 0),
            (0, self.height - 1),      # e.g., (0,24) si height=25
            (self.width - 1, 0),       # e.g., (23,0) si width=24
            (self.width - 1, self.height - 1)  # e.g., (23,24) si width=24 y height=25
        ]

        # Validar que las posiciones de inicio estén en carreteras
        for pos in self.starting_positions:
            agents_at_pos = self.grid.get_cell_list_contents([pos])
            if not any(isinstance(agent, Road) for agent in agents_at_pos):
                raise ValueError(f"Posición de inicio {pos} no contiene un agente Road.")

        # **Codificar la posición de destino**
        hardcoded_destination = (3, 22)  # Reemplaza con tus coordenadas deseadas

        # **Asegurarse de que exista un agente Destination en la posición codificada**
        existing_dest = False
        for dest in self.destinations:
            agents_at_dest = self.grid.get_cell_list_contents([hardcoded_destination])
            if any(agent.unique_id == dest.unique_id for agent in agents_at_dest):
                existing_dest = True
                break

        if not existing_dest:
            # Crear y colocar un agente Destination en la posición codificada
            dest_agent = Destination(f"d_hardcoded", self)
            self.grid.place_agent(dest_agent, hardcoded_destination)
            self.schedule.add(dest_agent)
            self.destinations.append(dest_agent)
            print(f"Agente Destination 'd_hardcoded' añadido en {hardcoded_destination}.")

        # Crear agentes Car y asignar destinos aleatorios desde self.destinations
        initial_cars = 4 if self.num_cars >= 4 else self.num_cars
        self.spawn_cars(initial_cars)

        self.num_cars = self.num_cars - initial_cars
        print("Coches restantes para generar: ", self.num_cars)
        self.running = True

    def spawn_cars(self, N):
        # Crear agentes Car y asignar destinos aleatorios desde self.destinations
        for i in range(N):
            start_pos = self.starting_positions[i % len(self.starting_positions)]  # Asegurar que no excedemos posiciones de inicio
            random_destination = random.choice(self.destinations)  # Seleccionar un destino aleatorio
            carAgent = Car(
                unique_id=f"car_{self.unique_id+1}", 
                model=self, 
                destination_pos=(random_destination.pos[0], random_destination.pos[1])  # Asignar coordenadas de destino aleatorias
            )
            self.unique_id += 1
            self.grid.place_agent(carAgent, start_pos)
            self.schedule.add(carAgent)
            self.cars.append(carAgent)
            print(f"Coche '{carAgent.unique_id}' creado en {start_pos} con destino {carAgent.destination_pos}.")

    def step(self):
        '''Avanza el modelo un paso.'''
        self.schedule.step()
        self.step_count += 1

        # Generar 4 coches cada 10 pasos
        if self.step_count % 10 == 0 and self.num_cars > 0:
            if self.num_cars >= 4:
                self.spawn_cars(4)
                self.num_cars -= 4
                print("Coches restantes para generar: ", self.num_cars)
            else:
                self.spawn_cars(self.num_cars)
                self.num_cars -= self.num_cars
                print("Coches restantes para generar: ", self.num_cars)
