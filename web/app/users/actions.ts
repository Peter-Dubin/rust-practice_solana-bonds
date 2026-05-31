"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, UserDoc } from "@/lib/types";

export interface UserListItem {
  _id: string;
  name: string;
}

export async function getUsers(): Promise<UserListItem[]> {
  const db = await getDb();
  const users = await db
    .collection<UserDoc>(COLLECTIONS.users)
    .find({}, { projection: { passwordHash: 0 } })
    .toArray();
  return users.map((u) => ({ _id: u._id!.toString(), name: u.name }));
}

/** Dev/admin convenience: add a name-only user (cannot log in until registered). */
export async function addUser(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const db = await getDb();
  await db
    .collection<UserDoc>(COLLECTIONS.users)
    .insertOne({ name, passwordHash: "" });
  revalidatePath("/users");
}
