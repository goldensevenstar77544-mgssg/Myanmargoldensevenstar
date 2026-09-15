import {
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

export function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  return new Date();
}

export function fromDoc<T extends { id: string }>(
  snap: QueryDocumentSnapshot<DocumentData>,
  map: (data: DocumentData, id: string) => T
): T {
  return map(snap.data(), snap.id);
}

export function serializeDates<T extends Record<string, unknown>>(
  data: T
): DocumentData {
  const result: DocumentData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      result[key] = Timestamp.fromDate(value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
