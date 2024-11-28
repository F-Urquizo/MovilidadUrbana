"""
Reto - Movilidad Urbana
Modelación de Sistemas Multiagentes con Gráficas Computacionales
28/11/2024
Francisco José Urquizo Schnaas A01028786
Gabriel Edid Harari A01782146
model.py
"""

# Importaciones necesarias desde las bibliotecas estándar y la biblioteca Mesa
import os  # Para interactuar con el sistema operativo, como manejar rutas de archivos
import json  # Para manejar archivos JSON
import requests # Para realizar solicitudes HTTP
import random  # Para generar números aleatorios
from mesa import Model  # Clase base para modelos en Mesa
from mesa.time import BaseScheduler  # Scheduler básico para gestionar la orden de ejecución de agentes
from mesa.space import MultiGrid  # Espacio de múltiples agentes por celda
from mesa.datacollection import DataCollector  # Para recopilar datos durante la simulación
from .agent import Road, Traffic_Light, Obstacle, Destination, Car  # Importa las clases de agentes definidas localmente

class CityModel(Model):
    """ 
    Crea un modelo basado en un mapa de ciudad.

    Este modelo simula el tráfico en una ciudad utilizando agentes que representan coches, carreteras,
    semáforos, obstáculos y destinos. El mapa de la ciudad se carga desde un archivo de texto y un
    diccionario de configuración en formato JSON.

    Args:
        width (int): Ancho de la cuadrícula.
        height (int): Altura de la cuadrícula.
    """
    def __init__(self, width=30, height=30):
        """Inicializa el modelo de la ciudad con las dimensiones especificadas."""
        super().__init__()

        # Inicializar listas para diferentes tipos de agentes
        self.traffic_lights = []  # Lista para almacenar semáforos
        self.cars = []  # Lista para almacenar coches
        self.destinations = []  # Lista para almacenar destinos
        self.obstacles = []  # Lista para almacenar obstáculos
        self.roads = []  # Lista para almacenar carreteras

        # Inicializar contadores y variables de estado
        self.step_count = 0  # Contador de pasos de la simulación
        self.unique_id = 0  # Identificador único para agentes
        self.cars_in_sim = 0  # Número actual de coches en la simulación
        self.prev_cars_in_sim = 0  # Número de coches en la simulación en el paso anterior
        self.reached_destinations = 0  # Contador de destinos alcanzados

        # Obtener la ruta absoluta del directorio actual (donde está model.py)
        current_dir = os.path.dirname(os.path.abspath(__file__))

        # Construir la ruta al archivo mapDictionary.json
        map_dict_path = os.path.join(current_dir, '..', 'city_files', 'mapDictionary.json')

        # Construir la ruta al archivo del mapa
        map_file_path = os.path.join(current_dir, '..', 'city_files', 'concurso.txt')

        # Cargar el diccionario del mapa con manejo de errores
        try:
            with open(map_dict_path) as f:
                dataDictionary = json.load(f)  # Cargar el diccionario desde el archivo JSON
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
                lines = baseFile.readlines()  # Leer todas las líneas del archivo de mapa
            print(f"Mapa cargado desde {map_file_path}")
        except FileNotFoundError:
            print(f"Error: No se encontró el archivo {map_file_path}. Asegúrate de que el archivo exista.")
            raise
        except Exception as e:
            print(f"Error al leer {map_file_path}: {e}")
            raise

        # Verificar que todas las líneas tengan la misma longitud para asegurar la consistencia del mapa
        for r, row in enumerate(lines):
            stripped_row = row.strip()
            if len(stripped_row) != width:
                raise ValueError(f"Row {r} length {len(stripped_row)} does not match width {width}")

        # Asignar las dimensiones del grid
        self.width = width  # Ancho de la cuadrícula
        self.height = height  # Altura de la cuadrícula
        self.grid = MultiGrid(self.width, self.height, torus=False)  # Crear una cuadrícula múltiple sin torus
        self.schedule = BaseScheduler(self)  # Crear un scheduler básico para gestionar los agentes
        """
        El base scheduler se usa para eliminar la arbitrariedad en el movimiento de los coches en los puntos de spawn para que
        no se congestione prematuramente.
        """

        # Recopilar todas las posiciones de carreteras para validación
        road_positions = []

        # Iterar sobre cada fila y columna del mapa para crear y ubicar agentes
        for r, row in enumerate(lines):
            for c, col in enumerate(row.strip()):
                pos = (c, self.height - r - 1)  # Coordenadas en la cuadrícula

                # Validar que la posición esté dentro de la cuadrícula
                if not (0 <= pos[0] < self.width and 0 <= pos[1] < self.height):
                    print(f"Error: Intentando colocar agente en posición fuera de rango {pos}")
                    continue  # O lanzar una excepción según se prefiera

                # Crear y ubicar agentes según el carácter del mapa
                if col in ["v", "^", ">", "<"]:
                    # Crear un agente de tipo Road con la configuración adecuada
                    agent = Road(f"r_{r*self.width+c}", self, dataDictionary[col])
                    self.grid.place_agent(agent, pos)  # Colocar el agente en la cuadrícula
                    self.roads.append(agent)  # Añadir el agente a la lista de carreteras
                    road_positions.append(pos)  # Registrar la posición de la carretera

                elif col in ["S", "s"]:
                    # Crear un agente de tipo Traffic_Light con estado y tiempo de cambio
                    agent = Traffic_Light(
                        f"tl_{r*self.width+c}", 
                        self, 
                        state=False if col == "S" else True, 
                        timeToChange=int(dataDictionary[col])
                    )
                    self.grid.place_agent(agent, pos)  # Colocar el agente en la cuadrícula
                    self.schedule.add(agent)  # Añadir el agente al scheduler para su gestión
                    self.traffic_lights.append(agent)  # Añadir el agente a la lista de semáforos

                elif col == "#":
                    # Crear un agente de tipo Obstacle
                    agent = Obstacle(f"ob_{r*self.width+c}", self)
                    self.grid.place_agent(agent, pos)  # Colocar el agente en la cuadrícula
                    self.obstacles.append(agent)  # Añadir el agente a la lista de obstáculos

                elif col == "D":
                    # Crear un agente de tipo Destination
                    agent = Destination(f"d_{r*self.width+c}", self)
                    self.grid.place_agent(agent, pos)  # Colocar el agente en la cuadrícula
                    self.destinations.append(agent)  # Añadir el agente a la lista de destinos

        # Mezclar aleatoriamente la lista de destinos para asignaciones aleatorias
        random.shuffle(self.destinations)

        # Definir posiciones de inicio fijas para los coches
        self.starting_positions = [
            (0, 0),
            (0, self.height - 1),
            (self.width - 1, 0),
            (self.width - 1, self.height - 1)
        ]

        # Verificar que cada posición de inicio contenga al menos una carretera
        for pos in self.starting_positions:
            agents_at_pos = self.grid.get_cell_list_contents([pos])
            if not any(isinstance(agent, Road) for agent in agents_at_pos):
                raise ValueError(f"Posición de inicio {pos} no contiene un agente Road.")

        # Definir una posición de destino fija (hardcoded)
        hardcoded_destination = (3, 22)

        # Verificar que la posición de destino esté dentro de la cuadrícula
        if not (0 <= hardcoded_destination[0] < self.width and 0 <= hardcoded_destination[1] < self.height):
            raise ValueError(f"hardcoded_destination {hardcoded_destination} fuera de rango.")

        # Verificar si ya existe un destino en la posición hardcoded_destination
        existing_dest = False
        for dest in self.destinations:
            agents_at_dest = self.grid.get_cell_list_contents([hardcoded_destination])
            if any(agent.unique_id == dest.unique_id for agent in agents_at_dest):
                existing_dest = True
                break

        # Si no existe, añadir un nuevo agente de destino en la posición hardcoded
        if not existing_dest:
            dest_agent = Destination(f"d_hardcoded", self)
            self.grid.place_agent(dest_agent, hardcoded_destination)
            self.schedule.add(dest_agent)  # Añadir al scheduler si es necesario
            self.destinations.append(dest_agent)  # Añadir a la lista de destinos
            print(f"Agente Destination 'd_hardcoded' añadido en {hardcoded_destination}.")

        # Configurar DataCollector para recopilar información durante la simulación
        self.datacollector = DataCollector(
            model_reporters={
                "Cars_in_sim": lambda model: len(model.cars),  # Número de coches en la simulación
            }
        )

        # Spawn inicial de coches basado en N (aquí N=4)
        self.spawn_cars(4)
        self.datacollector.collect(self)  # Recopilar datos iniciales
        self.running = True  # Indicar que la simulación está en ejecución

    def compute_cars_in_sim(self):
        """Calcula y retorna el número actual de coches en la simulación."""
        return self.cars_in_sim

    def compute_reached_destinations(self):
        """
        Implementa la lógica para calcular destinos alcanzados.

        Este método debe ser implementado para actualizar y retornar el número de destinos
        que han sido alcanzados por los coches en la simulación.
        """
        return self.reached_destinations

    def spawn_cars(self, N):
        """
        Crea agentes Car y los asigna a posiciones de inicio disponibles con destinos aleatorios.

        Args:
            N (int): Número de coches a generar.

        Returns:
            bool: True si al menos un coche fue creado, False en caso contrario.
        """
        # Filtrar posiciones de inicio que no tienen ya un coche
        available_start_positions = [
            pos for pos in self.starting_positions
            if not any(isinstance(agent, Car) for agent in self.grid.get_cell_list_contents([pos]))
        ]

        if not available_start_positions:
            print("No hay posiciones de inicio disponibles para spawn de coches.")
            return False

        cars_spawned = 0  # Contador de coches creados

        # Iterar sobre las posiciones de inicio disponibles
        for pos in available_start_positions:
            if cars_spawned >= N:
                break  # Salir si ya se han creado suficientes coches
            if len(self.destinations) == 0:
                print("No hay destinos disponibles para asignar a los coches.")
                break
            random_destination = random.choice(self.destinations)  # Seleccionar un destino aleatorio
            carAgent = Car(
                unique_id=f"car_{self.unique_id+1}", 
                model=self, 
                destination_pos=(random_destination.pos[0], random_destination.pos[1])
            )
            self.unique_id += 1  # Incrementar el ID único
            self.grid.place_agent(carAgent, pos)  # Colocar el coche en la cuadrícula
            self.schedule.add(carAgent)  # Añadir el coche al scheduler
            self.cars.append(carAgent)  # Añadir el coche a la lista de coches
            print(f"Coche '{carAgent.unique_id}' creado en {pos} con destino {carAgent.destination_pos}.")
            cars_spawned += 1  # Incrementar el contador de coches creados

        self.cars_in_sim += cars_spawned  # Actualizar el número de coches en la simulación
        return cars_spawned > 0  # Retornar True si al menos un coche fue creado

    def step(self):
        """Avanza el modelo un paso en el tiempo."""
        # Procesar todos los agentes según el scheduler
        self.schedule.step()
        self.step_count += 1  # Incrementar el contador de pasos

        # Recopilar datos para el paso actual
        self.datacollector.collect(self)

        # Spawn de coches cada 1 paso (originalmente cada 10 pasos)
        if self.step_count % 10 == 0:
            cars_spawned = self.spawn_cars(4)  # Intentar crear 4 coches
            if not cars_spawned:
                print("No se pueden generar más coches en este paso.")
                self.running = False  # Detener la simulación si no se pueden crear más coches
                
        # Publicar al servidor de la competencia cada 10 pasos
        # if self.step_count % 10 == 0:
        #     url = "http://10.49.12.55:5000/api/"
        #     endpoint = "attempt"

        #     data = {
        #         "year" : 2024,
        #         "classroom" : 301,
        #         "name" : "El Fran y El Gabo",
        #         "current_cars": self.cars_in_sim,
        #         "total_arrived": self.reached_destinations
        #     }

        #     headers = {
        #         "Content-Type": "application/json"
        #     }

        #     response = requests.post(url+endpoint, data=json.dumps(data), headers=headers)

        #     print("Request " + "successful" if response.status_code == 200 else "failed", "Status code:", response.status_code)
        #     print("Response:", response.json())
