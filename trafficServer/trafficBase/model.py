import os
import json
import random
from mesa import Model
from mesa.time import BaseScheduler
from mesa.space import MultiGrid
from mesa.datacollection import DataCollector
from .agent import Road, Traffic_Light, Obstacle, Destination, Car

class CityModel(Model):
    """ 
        Crea un modelo basado en un mapa de ciudad.

        Args:
            N (int): Número de agentes (coches) en la simulación.
            width (int): Ancho de la cuadrícula.
            height (int): Altura de la cuadrícula.
    """
    def __init__(self, N=10, width=30, height=30):
        super().__init__()

        # Inicializar listas para diferentes tipos de agentes
        self.traffic_lights = []
        self.cars = []
        self.destinations = []
        self.obstacles = []
        self.roads = []  # Almacena Road agents

        self.step_count = 0
        self.num_cars = N
        self.unique_id = 0
        self.cars_in_sim = 0
        self.prev_cars_in_sim = 0
        self.reached_destinations = 0

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

        # Verificar que todas las líneas tengan la misma longitud
        for r, row in enumerate(lines):
            stripped_row = row.strip()
            if len(stripped_row) != width:
                raise ValueError(f"Row {r} length {len(stripped_row)} does not match width {width}")

        self.width = width  # Usar el ancho pasado como parámetro
        self.height = height  # Usar la altura pasada como parámetro
        self.grid = MultiGrid(self.width, self.height, torus=False) 
        self.schedule = BaseScheduler(self)

        # Recopilar todas las posiciones de carreteras para validación
        road_positions = []

        for r, row in enumerate(lines):
            for c, col in enumerate(row.strip()):
                pos = (c, self.height - r - 1)
                
                # Validar que la posición esté dentro de la cuadrícula
                if not (0 <= pos[0] < self.width and 0 <= pos[1] < self.height):
                    print(f"Error: Intentando colocar agente en posición fuera de rango {pos}")
                    continue  # O lanzar una excepción

                if col in ["v", "^", ">", "<"]:
                    agent = Road(f"r_{r*self.width+c}", self, dataDictionary[col])
                    self.grid.place_agent(agent, pos)
                    self.roads.append(agent)  # Añadir Road agent a self.roads
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
                    self.obstacles.append(agent)

                elif col == "D":
                    agent = Destination(f"d_{r*self.width+c}", self)
                    self.grid.place_agent(agent, pos)
                    self.destinations.append(agent)

        random.shuffle(self.destinations)

        self.starting_positions = [
            (0, 0),
            (0, self.height - 1),
            (self.width - 1, 0),
            (self.width - 1, self.height - 1)
        ]

        for pos in self.starting_positions:
            agents_at_pos = self.grid.get_cell_list_contents([pos])
            if not any(isinstance(agent, Road) for agent in agents_at_pos):
                raise ValueError(f"Posición de inicio {pos} no contiene un agente Road.")

        hardcoded_destination = (3, 22)

        # Verificar que hardcoded_destination esté dentro de la cuadrícula
        if not (0 <= hardcoded_destination[0] < self.width and 0 <= hardcoded_destination[1] < self.height):
            raise ValueError(f"hardcoded_destination {hardcoded_destination} fuera de rango.")

        existing_dest = False
        for dest in self.destinations:
            agents_at_dest = self.grid.get_cell_list_contents([hardcoded_destination])
            if any(agent.unique_id == dest.unique_id for agent in agents_at_dest):
                existing_dest = True
                break

        if not existing_dest:
            dest_agent = Destination(f"d_hardcoded", self)
            self.grid.place_agent(dest_agent, hardcoded_destination)
            self.schedule.add(dest_agent)
            self.destinations.append(dest_agent)
            print(f"Agente Destination 'd_hardcoded' añadido en {hardcoded_destination}.")

        # Configurar DataCollector para recopilar información
        self.datacollector = DataCollector(
            model_reporters={
                "Cars_in_sim": lambda model: len(model.cars),
            }
        )

        # Spawn inicial de coches basado en N
        cars_spawned = self.spawn_cars(self.num_cars)
        if cars_spawned:
            print(f"{cars_spawned} coches iniciales generados.")
        else:
            print("No se pudieron generar coches iniciales.")

        self.datacollector.collect(self)
        self.running = True


    def compute_cars_in_sim(self):
        return len(self.cars)
    
    def compute_reached_destinations(self):
        # Implementa la lógica para calcular destinos alcanzados
        return self.reached_destinations

    def spawn_cars(self, N):
        """Crea agentes Car y asigna destinos aleatorios."""
        available_start_positions = [
            pos for pos in self.starting_positions
            if not any(isinstance(agent, Car) for agent in self.grid.get_cell_list_contents([pos]))
        ]

        if not available_start_positions:
            print("No hay posiciones de inicio disponibles para spawn de coches.")
            return False

        cars_spawned = 0
        for pos in available_start_positions:
            if cars_spawned >= N:
                break
            if len(self.destinations) == 0:
                print("No hay destinos disponibles para asignar a los coches.")
                break
            random_destination = random.choice(self.destinations)
            carAgent = Car(
                unique_id=f"car_{self.unique_id+1}", 
                model=self, 
                destination_pos=(random_destination.pos[0], random_destination.pos[1])
            )
            self.unique_id += 1
            self.grid.place_agent(carAgent, pos)
            self.schedule.add(carAgent)
            self.cars.append(carAgent)
            print(f"Coche '{carAgent.unique_id}' creado en {pos} con destino {carAgent.destination_pos}.")
            cars_spawned += 1
        
        self.cars_in_sim += cars_spawned
        return cars_spawned > 0

    def step(self):
        """Avanza el modelo un paso."""
        # Procesar agentes existentes (por ejemplo, coches, semáforos)
        self.schedule.step()
        self.step_count += 1

        # Recopilar datos para el paso actual
        self.datacollector.collect(self)

        # Spawn de coches cada 10 pasos
        if self.step_count % 10 == 0:
            cars_spawned = self.spawn_cars(4)
            if not cars_spawned:
                print("No se pueden generar más coches en este paso.")
                self.running = False 
