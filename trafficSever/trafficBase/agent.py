# trafficBase/agent.py

from mesa import Agent
import heapq

class Car(Agent):
    """
    Agent que se mueve hacia un destino usando búsqueda de ruta A* con capacidades de cambio de carril.
    """
    def __init__(self, unique_id, model, destination_pos):
        super().__init__(unique_id, model)
        self.destination_pos = destination_pos
        self.path = None
        self.last_position = None
        self.stuck_counter = 0  # Para rastrear cuánto tiempo ha estado el auto en la misma posición

    def heuristic(self, a, b):
        """Calcula la heurística de distancia Manhattan."""
        return abs(a[0] - b[0]) + abs(a[1] - b[1])

    def is_lane_clear(self, position):
        """Verifica si una posición específica está libre de otros coches."""
        agents_at_position = self.model.grid.get_cell_list_contents([position])
        return all(not isinstance(agent, Car) for agent in agents_at_position)

    def detect_car_in_front(self):
        """Detecta si hay un coche directamente en frente del coche actual."""
        next_move = self.path[0] if self.path else None
        if next_move:
            agents_at_next = self.model.grid.get_cell_list_contents([next_move])
            return any(isinstance(agent, Car) for agent in agents_at_next)
        return False

    def switch_lanes(self):
        """Intenta cambiar de carril para evitar quedarse atascado detrás de otro coche."""
        # Verificar carriles paralelos (izquierda y derecha)
        current_x, current_y = self.pos
        possible_lanes = [
            (current_x, current_y + 1),  # Carril derecho
            (current_x, current_y - 1)   # Carril izquierdo
        ]

        for lane in possible_lanes:
            if self.model.grid.out_of_bounds(lane):
                continue  # Saltar si el carril está fuera de los límites

            if self.is_lane_clear(lane):
                print(f"{self.unique_id}: Cambiando de carril a {lane}")
                self.model.grid.move_agent(self, lane)
                return True

        print(f"{self.unique_id}: No se pudo cambiar de carril.")
        return False

    def find_path(self):
        """Encuentra una ruta válida usando A*."""
        start = self.pos
        goal = self.destination_pos
        grid = self.model.grid

        open_set = []
        heapq.heappush(open_set, (0 + self.heuristic(start, goal), 0, start, [start]))
        closed_set = set()

        def is_move_allowed(current, neighbor):
            agents_at_neighbor = grid.get_cell_list_contents([neighbor])

            if any(isinstance(agent, Car) for agent in agents_at_neighbor):
                return False  # Evitar colisiones

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

            return True

        while open_set:
            f_score, g_score, current, path = heapq.heappop(open_set)

            if current == goal:
                return path[1:]

            if current in closed_set:
                continue
            closed_set.add(current)

            neighbors = grid.get_neighborhood(
                current,
                moore=False,
                include_center=False
            )

            for neighbor in neighbors:
                if neighbor in closed_set:
                    continue

                if not is_move_allowed(current, neighbor):
                    continue

                # Verificar si el vecino es transitable (Road, Destination, o Traffic Light)
                agents_at_neighbor = grid.get_cell_list_contents([neighbor])
                traversable = any(isinstance(agent, (Road, Destination, Traffic_Light)) for agent in agents_at_neighbor)

                if not traversable:
                    continue

                tentative_g_score = g_score + 1  # Suponiendo costo uniforme

                # Verificar si el vecino ya está en open_set con un g_score mayor
                in_open_set = False
                for item in open_set:
                    if item[2] == neighbor and tentative_g_score >= item[1]:
                        in_open_set = True
                        break

                if not in_open_set:
                    heapq.heappush(open_set, (tentative_g_score + self.heuristic(neighbor, goal), tentative_g_score, neighbor, path + [neighbor]))

        print(f"No se encontró una ruta para {self.unique_id} desde {start} hasta {goal}.")
        return []

    def step(self):
        # Actualizar contador de atascos
        if self.last_position == self.pos:
            self.stuck_counter += 1
        else:
            self.stuck_counter = 0
        self.last_position = self.pos

        # Verificar si está atascado por demasiado tiempo
        if self.stuck_counter > 15:
            print(f"{self.unique_id}: Atascado por {self.stuck_counter} pasos. Encontrando ruta alternativa.")
            self.path = self.find_path()
            self.stuck_counter = 0  # Reiniciar el contador
            return

        # Lógica de búsqueda de ruta
        if self.path is None:
            self.path = self.find_path()
            if not self.path:
                print(f"{self.unique_id}: No se encontró una ruta inicial.")
                return

        # Verificar si hay un coche al frente e intentar cambiar de carril
        if self.detect_car_in_front():
            if not self.switch_lanes():
                print(f"{self.unique_id}: Esperando que el coche al frente se mueva.")
                return

        # Moverse a lo largo de la ruta
        if self.path:
            next_move = self.path[0]  # Observar sin eliminar
            agents_at_next = self.model.grid.get_cell_list_contents([next_move])

            can_move = True
            for agent in agents_at_next:
                if isinstance(agent, Traffic_Light) and not agent.state:
                    can_move = False  # Semáforo en rojo bloquea el movimiento
                elif isinstance(agent, Obstacle):
                    can_move = False  # Obstáculo bloquea el movimiento
                elif isinstance(agent, Car):
                    can_move = False  # Otro coche bloquea el movimiento

            if can_move:
                self.model.grid.move_agent(self, next_move)
                print(f"{self.unique_id} se movió a {next_move}")
                self.path.pop(0)  # Eliminar el paso después de moverse
            else:
                print(f"{self.unique_id} bloqueado en {next_move}, esperando semáforo verde, coche que se mueve u obstáculo que se despeja.")
        else:
            if self.pos == self.destination_pos:
                print(f"{self.unique_id} ha llegado al destino.")
                self.model.grid.remove_agent(self)
                self.model.schedule.remove(self)
            else:
                self.path = self.find_path()


class Traffic_Light(Agent):
    def __init__(self, unique_id, model, state=False, timeToChange=10):
        super().__init__(unique_id, model)
        self.state = state
        self.timeToChange = timeToChange

    def step(self):
        if self.model.schedule.steps % self.timeToChange == 0:
            self.state = not self.state
            state_str = "Green" if self.state else "Red"
            print(f"Traffic Light {self.unique_id} changed to {state_str}")

class Destination(Agent):
    def __init__(self, unique_id, model):
        super().__init__(unique_id, model)

    def step(self):
        pass

class Obstacle(Agent):
    def __init__(self, unique_id, model):
        super().__init__(unique_id, model)

    def step(self):
        pass

class Road(Agent):
    def __init__(self, unique_id, model, direction="Left"):
        super().__init__(unique_id, model)
        self.direction = direction

    def step(self):
        pass