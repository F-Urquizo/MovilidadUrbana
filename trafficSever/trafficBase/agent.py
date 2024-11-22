# agent.py

from mesa import Agent
import heapq

class Car(Agent):
    """
    Agente que se mueve hacia un destino usando A* con restricciones de dirección.
    Attributes:
        unique_id: ID del agente
        destination_pos: Coordenadas del destino
        path: Lista de posiciones a seguir
    """
    def __init__(self, unique_id, model, destination_pos):
        super().__init__(unique_id, model)
        self.destination_pos = destination_pos
        self.path = None

    def heuristic(self, a, b):
        """Calcula la heurística de distancia Manhattan."""
        return abs(a[0] - b[0]) + abs(a[1] - b[1])

    def find_path(self):
        """Encuentra un camino válido usando A* que respeta las restricciones de dirección."""
        start = self.pos
        goal = self.destination_pos
        grid = self.model.grid

        open_set = []
        heapq.heappush(open_set, (0 + self.heuristic(start, goal), 0, start, [start]))
        closed_set = set()

        def is_move_allowed(current, neighbor):
            agents_at_current = grid.get_cell_list_contents([current])
            agents_at_neighbor = grid.get_cell_list_contents([neighbor])

            intended_direction = (neighbor[0] - current[0], neighbor[1] - current[1])
            opposite_direction = ""
            if intended_direction == (1, 0):  # Moviéndose a la derecha
                opposite_direction = "Left"
            elif intended_direction == (-1, 0):  # Moviéndose a la izquierda
                opposite_direction = "Right"
            elif intended_direction == (0, 1):  # Moviéndose arriba
                opposite_direction = "Down"
            elif intended_direction == (0, -1):  # Moviéndose abajo
                opposite_direction = "Up"
            else:
                return False

            for agent in agents_at_neighbor:
                if isinstance(agent, Road) and agent.direction == opposite_direction:
                    return False  # Movimiento no permitido si la carretera tiene la dirección opuesta

            for agent in agents_at_current:
                if isinstance(agent, Road):
                    if agent.direction == "Up" and neighbor != (current[0], current[1] - 1):
                        return True
                    if agent.direction == "Down" and neighbor != (current[0], current[1] + 1):
                        return True
                    if agent.direction == "Left" and neighbor != (current[0] + 1, current[1]):
                        return True
                    if agent.direction == "Right" and neighbor != (current[0] - 1, current[1]):
                        return True
                if isinstance(agent, Traffic_Light):
                    return True
            return False

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

                agents_at_neighbor = grid.get_cell_list_contents([neighbor])
                traversable = any(isinstance(agent, (Road, Destination, Traffic_Light)) for agent in agents_at_neighbor)

                if not traversable:
                    continue

                tentative_g_score = g_score + 1

                in_open_set = False
                for item in open_set:
                    if item[2] == neighbor and tentative_g_score >= item[1]:
                        in_open_set = True
                        break

                if not in_open_set:
                    heapq.heappush(open_set, (tentative_g_score + self.heuristic(neighbor, goal), tentative_g_score, neighbor, path + [neighbor]))

        print(f"No path found for {self.unique_id} from {start} to {goal}.")
        return []

    def step(self):
        if self.path is None:
            self.path = self.find_path()
            if not self.path:
                print(f"{self.unique_id}: No initial path found.")
                return

        if self.path:
            next_move = self.path[0]
            agents_at_next = self.model.grid.get_cell_list_contents([next_move])

            can_move = True
            for agent in agents_at_next:
                if isinstance(agent, Traffic_Light) and not agent.state:
                    can_move = False
                elif isinstance(agent, Obstacle):
                    can_move = False

            if can_move:
                self.model.grid.move_agent(self, next_move)
                print(f"{self.unique_id} moved to {next_move}")
                self.path.pop(0)
            else:
                print(f"{self.unique_id} blocked at {next_move}, waiting for green light or obstacle to clear.")
        else:
            if self.pos == self.destination_pos:
                print(f"{self.unique_id} has arrived at the destination.")
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
