"""
Reto - Movilidad Urbana
Modelación de Sistemas Multiagentes con Gráficas Computacionales
28/11/2024
Francisco José Urquizo Schnaas A01028786
Gabriel Edid Harari A01782146
agent.py
"""

# Importaciones necesarias desde las bibliotecas estándar y la biblioteca Mesa
import heapq  # Para implementar la cola de prioridad utilizada en el algoritmo A*
from mesa import Agent  # Clase base para agentes en Mesa

class Car(Agent):
    """
    Agente que se mueve hacia un destino utilizando el algoritmo de búsqueda A* con capacidades de cambio de carril.
    
    Este agente representa un coche en la simulación de tráfico. El coche calcula una ruta hacia su destino,
    detecta obstáculos como otros coches, semáforos en rojo y obstáculos físicos, y puede intentar cambiar de carril
    para evitar quedarse atascado.
    """

    def __init__(self, unique_id, model, destination_pos):
        """
        Inicializa el agente Car con un identificador único, referencia al modelo y posición de destino.
        
        Args:
            unique_id (str): Identificador único del agente.
            model (Model): Referencia al modelo de la simulación.
            destination_pos (tuple): Coordenadas (x, y) del destino del coche.
        """
        super().__init__(unique_id, model)
        self.destination_pos = destination_pos  # Posición objetivo del coche
        self.path = None  # Ruta calculada hacia el destino
        self.last_position = None  # Última posición del coche
        self.stuck_counter = 0  # Contador para rastrear cuánto tiempo ha estado el coche en la misma posición

    def heuristic(self, a, b):
        """
        Calcula la heurística de distancia Manhattan entre dos puntos.
        
        Args:
            a (tuple): Coordenadas (x, y) del primer punto.
            b (tuple): Coordenadas (x, y) del segundo punto.
        
        Returns:
            int: Distancia Manhattan entre los dos puntos.
        """
        return abs(a[0] - b[0]) + abs(a[1] - b[1])

    def is_lane_clear(self, position):
        """
        Verifica si un carril específico (posición) está libre de otros coches.
        
        Args:
            position (tuple): Coordenadas (x, y) del carril a verificar.
        
        Returns:
            bool: True si el carril está libre, False en caso contrario.
        """
        agents_at_position = self.model.grid.get_cell_list_contents([position])
        return all(not isinstance(agent, Car) for agent in agents_at_position)

    def detect_car_in_front(self):
        """
        Detecta si hay un coche directamente frente a la posición actual.
        
        Returns:
            bool: True si hay un coche en la siguiente posición de la ruta, False en caso contrario.
        """
        next_move = self.path[0] if self.path else None
        if next_move:
            agents_at_next = self.model.grid.get_cell_list_contents([next_move])
            return any(isinstance(agent, Car) for agent in agents_at_next)
        return False

    def switch_lanes(self):
        """
        Intenta cambiar de carril para evitar quedarse atascado detrás de otro coche.
        
        Este método evalúa las posibles posiciones adyacentes según la dirección actual de la carretera.
        Verifica si los carriles adyacentes están libres y en la misma dirección antes de intentar cambiar de carril.
        
        Returns:
            bool: True si el cambio de carril fue exitoso, False en caso contrario.
        """
        # Obtener la dirección actual de la carretera en la posición del coche
        current_agents = self.model.grid.get_cell_list_contents([self.pos])
        current_direction = None
        for agent in current_agents:
            if isinstance(agent, Road):
                current_direction = agent.direction
                break
        if current_direction is None:
            print(f"{self.unique_id}: Not on a road. Cannot switch lanes.")
            return False

        # Determinar carriles posibles basados en la dirección actual
        current_x, current_y = self.pos
        if current_direction in ["Up", "Down"]:
            possible_lanes = [
                (current_x + 1, current_y),  # Carril derecho
                (current_x - 1, current_y)   # Carril izquierdo
            ]
        elif current_direction in ["Left", "Right"]:
            possible_lanes = [
                (current_x, current_y + 1),  # Carril superior
                (current_x, current_y - 1)   # Carril inferior
            ]
        else:
            print(f"{self.unique_id}: Unknown direction {current_direction}. Cannot switch lanes.")
            return False

        # Verificar carriles posibles
        for lane in possible_lanes:
            if self.model.grid.out_of_bounds(lane):
                continue  # Saltar si el carril está fuera de los límites

            agents_at_lane = self.model.grid.get_cell_list_contents([lane])
            lane_clear = True
            lane_direction = None

            for agent in agents_at_lane:
                if isinstance(agent, Road):
                    lane_direction = agent.direction
                    if lane_direction != current_direction:
                        lane_clear = False
                        break
                elif isinstance(agent, (Car, Obstacle)):
                    lane_clear = False
                    break
                elif isinstance(agent, Destination) and agent.pos != self.destination_pos:
                    lane_clear = False
                    break
                elif isinstance(agent, Traffic_Light) and not agent.state:
                    lane_clear = False
                    break

            if lane_clear and lane_direction == current_direction:
                # Cambiar de carril
                print(f"{self.unique_id}: Switching lanes to {lane}")
                self.model.grid.move_agent(self, lane)
                print(f"{self.unique_id}: Switched lanes to {lane}")
                # Recalcular ruta desde la nueva posición
                self.path = self.find_path()
                return True

        print(f"{self.unique_id}: Unable to switch lanes.")
        return False

    def find_path(self):
        """
        Encuentra una ruta válida desde la posición actual hasta el destino utilizando el algoritmo A*.
        
        Returns:
            list: Lista de coordenadas (x, y) que representan la ruta hacia el destino, excluyendo la posición actual.
                  Retorna una lista vacía si no se encuentra ninguna ruta.
        """
        start = self.pos  # Posición inicial del coche
        goal = self.destination_pos  # Posición objetivo del coche
        grid = self.model.grid  # Referencia al espacio de la cuadrícula

        # Inicializar la cola de prioridad con el nodo de inicio
        open_set = []
        heapq.heappush(open_set, (0 + self.heuristic(start, goal), 0, start, [start]))
        closed_set = set()  # Conjunto de nodos ya evaluados

        def is_traversable(current, neighbor):
            """
            Verifica si una celda vecina es transitable desde la celda actual.
            
            Args:
                current (tuple): Coordenadas (x, y) de la celda actual.
                neighbor (tuple): Coordenadas (x, y) de la celda vecina.
            
            Returns:
                bool: True si la celda vecina es transitable, False en caso contrario.
            """
            agents_at_neighbor = grid.get_cell_list_contents([neighbor])

            # Determinar la dirección prevista basada en el movimiento
            intended_direction = (neighbor[0] - current[0], neighbor[1] - current[1])
            opposite_direction = ""
            if intended_direction == (1, 0):
                opposite_direction = "Left"
            elif intended_direction == (-1, 0):
                opposite_direction = "Right"
            elif intended_direction == (0, 1):
                opposite_direction = "Down"
            elif intended_direction == (0, -1):
                opposite_direction = "Up"

            for agent in agents_at_neighbor:
                if isinstance(agent, Road) and agent.direction == opposite_direction:
                    return False
                if isinstance(agent, Destination) and neighbor != self.destination_pos:
                    return False  # Solo se permite el propio destino

            return True

        while open_set:
            f_score, g_score, current, path = heapq.heappop(open_set)

            if current == goal:
                return path[1:]  # Retornar la ruta excluyendo la posición actual

            if current in closed_set:
                continue
            closed_set.add(current)

            # Obtener vecinos adyacentes (sin diagonales)
            neighbors = grid.get_neighborhood(
                current,
                moore=False,
                include_center=False
            )

            for neighbor in neighbors:
                if neighbor in closed_set:
                    continue

                if not is_traversable(current, neighbor):
                    continue

                # Verificar si el vecino es transitable (Carretera, Destino propio, o Semáforo)
                agents_at_neighbor = grid.get_cell_list_contents([neighbor])
                traversable = False
                car_present = False
                for agent in agents_at_neighbor:
                    if isinstance(agent, Road) or isinstance(agent, Traffic_Light):
                        traversable = True
                    elif isinstance(agent, Destination):
                        if neighbor == self.destination_pos:
                            traversable = True
                        else:
                            traversable = False
                            break  # No transitable si es otro destino
                    elif isinstance(agent, Car):
                        # Permitir la travesía pero marcar que hay un coche presente
                        traversable = True
                        car_present = True

                if not traversable:
                    continue

                # Añadir costo de cambio de carril
                lane_change_cost = 0
                if self.pos and ((current[0] != neighbor[0]) and (current[1] != neighbor[1])):
                    lane_change_cost = 1  # Penalizar cambios de carril

                # Añadir penalización si hay un coche presente en la celda vecina
                car_penalty = 5 if car_present else 0

                tentative_g_score = g_score + 1 + lane_change_cost + car_penalty  # Asumir costo uniforme

                # Verificar si el vecino ya está en open_set con un g_score menor
                in_open_set = False
                for item in open_set:
                    if item[2] == neighbor and tentative_g_score >= item[1]:
                        in_open_set = True
                        break

                if not in_open_set:
                    heapq.heappush(
                        open_set,
                        (
                            tentative_g_score + self.heuristic(neighbor, goal),  # f_score
                            tentative_g_score,  # g_score
                            neighbor,
                            path + [neighbor]  # Ruta actualizada
                        )
                    )

        print(f"No path found for {self.unique_id} from {start} to {goal}.")
        return []

    def step(self):
        """
        Avanza el estado del agente un paso en la simulación.
        
        Este método se llama en cada paso de la simulación y gestiona el movimiento del coche,
        la detección de obstáculos, el cambio de carril y la llegada al destino.
        """
        # Actualizar el contador de atascamiento
        if self.last_position == self.pos:
            self.stuck_counter += 1
        else:
            self.stuck_counter = 0
        self.last_position = self.pos

        # Verificar si el coche ha estado atascado por demasiado tiempo
        if self.stuck_counter > 2:  # Reducido de 7 a 2
            print(f"{self.unique_id}: Stuck for {self.stuck_counter} steps. Finding alternate path.")
            self.path = self.find_path()
            self.stuck_counter = 0  # Reiniciar el contador
            return

        # Lógica de búsqueda de ruta
        if self.path is None:
            self.path = self.find_path()
            if not self.path:
                print(f"{self.unique_id}: No initial path found.")
                return

        # Verificar si hay un coche delante y intentar cambiar de carril
        if self.detect_car_in_front():
            if not self.switch_lanes():
                print(f"{self.unique_id}: Waiting for the car in front to move.")
                return

        # Moverse a lo largo de la ruta
        if self.path:
            next_move = self.path[0]  # Obtener el siguiente movimiento sin eliminarlo
            agents_at_next = self.model.grid.get_cell_list_contents([next_move])

            can_move = True
            for agent in agents_at_next:
                if isinstance(agent, Traffic_Light) and not agent.state:
                    can_move = False  # Semáforo rojo bloquea el movimiento
                elif isinstance(agent, Obstacle):
                    can_move = False  # Obstáculo bloquea el movimiento
                elif isinstance(agent, Car):
                    can_move = False  # Otro coche bloquea el movimiento
                elif isinstance(agent, Destination) and next_move != self.destination_pos:
                    can_move = False  # No se puede mover a destinos de otros coches

            if can_move:
                self.model.grid.move_agent(self, next_move)
                print(f"{self.unique_id} moved to {next_move}")
                self.path.pop(0)  # Eliminar el movimiento después de moverse
                self.stuck_counter = 0  # Reiniciar el contador de atascamiento al moverse
            else:
                print(f"{self.unique_id} blocked at {next_move}, waiting for green light or car to move or obstacle to clear.")
        else:
            if self.pos == self.destination_pos:
                print(f"{self.unique_id} has arrived at the destination.")
                self.model.grid.remove_agent(self)  # Eliminar el agente de la cuadrícula
                self.model.schedule.remove(self)  # Eliminar el agente del scheduler
                self.model.cars_in_sim -= 1  # Decrementar el contador de coches en la simulación
                self.model.reached_destinations += 1  # Incrementar el contador de destinos alcanzados
            else:
                self.path = self.find_path()

class Traffic_Light(Agent):
    """
    Agente que representa un semáforo en la simulación.
    
    Este agente cambia de estado entre verde y rojo a intervalos definidos, afectando el movimiento de los coches.
    """

    def __init__(self, unique_id, model, state=True, timeToChange=5):
        """
        Inicializa el agente Traffic_Light con un identificador único, referencia al modelo, estado inicial y tiempo para cambiar.
        
        Args:
            unique_id (str): Identificador único del agente.
            model (Model): Referencia al modelo de la simulación.
            state (bool): Estado inicial del semáforo (True = Verde, False = Rojo).
            timeToChange (int): Número de pasos antes de cambiar el estado.
        """
        super().__init__(unique_id, model)
        self.state = state  # Estado del semáforo: True = Verde, False = Rojo
        self.timeToChange = timeToChange  # Tiempo en pasos para cambiar el estado

    def step(self):
        """
        Avanza el estado del semáforo un paso en la simulación.
        
        Este método se llama en cada paso de la simulación y cambia el estado del semáforo
        si ha transcurrido el tiempo definido para el cambio.
        """
        if self.model.schedule.steps % self.timeToChange == 0:
            self.state = not self.state  # Cambiar el estado del semáforo
            state_str = "Green" if self.state else "Red"
            print(f"Traffic Light {self.unique_id} changed to {state_str}")

class Destination(Agent):
    """
    Agente que representa un destino en la simulación.
    
    Este agente no realiza ninguna acción en cada paso de la simulación.
    """

    def __init__(self, unique_id, model):
        """
        Inicializa el agente Destination con un identificador único y referencia al modelo.
        
        Args:
            unique_id (str): Identificador único del agente.
            model (Model): Referencia al modelo de la simulación.
        """
        super().__init__(unique_id, model)

    def step(self):
        """
        Método de avance del agente Destination.
        
        Este método está vacío ya que los destinos no necesitan realizar acciones en cada paso.
        """
        pass

class Obstacle(Agent):
    """
    Agente que representa un obstáculo en la simulación.
    
    Este agente no realiza ninguna acción en cada paso de la simulación.
    """

    def __init__(self, unique_id, model):
        """
        Inicializa el agente Obstacle con un identificador único y referencia al modelo.
        
        Args:
            unique_id (str): Identificador único del agente.
            model (Model): Referencia al modelo de la simulación.
        """
        super().__init__(unique_id, model)

    def step(self):
        """
        Método de avance del agente Obstacle.
        
        Este método está vacío ya que los obstáculos no necesitan realizar acciones en cada paso.
        """
        pass

class Road(Agent):
    """
    Agente que representa una carretera en la simulación.
    
    Este agente almacena la dirección de la carretera y no realiza acciones en cada paso de la simulación.
    """

    def __init__(self, unique_id, model, direction="Left"):
        """
        Inicializa el agente Road con un identificador único, referencia al modelo y dirección.
        
        Args:
            unique_id (str): Identificador único del agente.
            model (Model): Referencia al modelo de la simulación.
            direction (str): Dirección de la carretera (e.g., "Left", "Right", "Up", "Down").
        """
        super().__init__(unique_id, model)
        self.direction = direction  # Dirección de la carretera

    def step(self):
        """
        Método de avance del agente Road.
        
        Este método está vacío ya que las carreteras no necesitan realizar acciones en cada paso.
        """
        pass
