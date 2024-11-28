import os
from mesa import Model
from mesa.time import RandomActivation
from mesa.space import MultiGrid
from mesa import DataCollector
from agent import Road, Traffic_Light, Obstacle, Destination, Car
import json
import random
from mesa.time import BaseScheduler

class CityModel(Model):
    """ 
        Crea un modelo basado en un mapa de ciudad.

        Args:
            N: Número de agentes (coches) en la simulación
    """
    def __init__(self):
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
        self.obstacles = []
        self.step_count = 0
        self.unique_id = 0
        self.cars_in_sim = 0
        self.prev_cars_in_sim = 0
        self.reached_destinations = 0

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

        self.width = len(lines[0].strip())
        self.height = len(lines)
        self.grid = MultiGrid(self.width, self.height, torus=False) 
        self.schedule = BaseScheduler(self)

        # Recopilar todas las posiciones de carreteras para validación
        road_positions = []

        for r, row in enumerate(lines):
            for c, col in enumerate(row.strip()):
                pos = (c, self.height - r - 1)
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
        self.spawn_cars(4)
        print("Coches iniciales generados.")
        self.datacollector.collect(self)
        self.running = True


    def compute_cars_in_sim(self):
        return self.cars_in_sim
    
    def compute_reached_destinations(self):
        return self.reached_destinations

    def spawn_cars(self, N):
        """Create car agents and assign random destinations."""
        available_start_positions = [
            pos for pos in self.starting_positions
            if not any(isinstance(agent, Car) for agent in self.grid.get_cell_list_contents([pos]))
        ]

        if not available_start_positions:
            print("No available starting positions to spawn cars.")
            return False

        cars_spawned = 0
        for pos in available_start_positions:
            if cars_spawned >= N:
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
        """Advance the model by one step."""
        # Process existing agents (e.g., cars, traffic lights)
        self.schedule.step()
        self.step_count += 1

        # Collect data for the current step
        self.datacollector.collect(self)

        # Spawn cars only after processing current agents
        if self.step_count % 10 == 0:
            cars_spawned = self.spawn_cars(4)
            if not cars_spawned:
                print("No more cars can be spawned this step.")
                self.running = False  

