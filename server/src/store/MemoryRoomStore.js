/**
 * In-memory room storage for the MVP. The rest of the server only touches
 * rooms through this interface, so swapping in Redis means implementing the
 * same five methods (see README "Scaling beyond memory").
 */
export class MemoryRoomStore {
  #rooms = new Map();

  get(code) {
    return this.#rooms.get(code) ?? null;
  }

  has(code) {
    return this.#rooms.has(code);
  }

  set(room) {
    this.#rooms.set(room.code, room);
  }

  delete(code) {
    this.#rooms.delete(code);
  }

  values() {
    return this.#rooms.values();
  }

  get size() {
    return this.#rooms.size;
  }
}
