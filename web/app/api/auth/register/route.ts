import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, UserDoc } from "@/lib/types";
import { credentialsSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { user, password } = parsed.data;

  const db = await getDb();
  const users = db.collection<UserDoc>(COLLECTIONS.users);

  const existing = await users.findOne({ name: user });
  if (existing) {
    return NextResponse.json({ error: "User already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await users.insertOne({ name: user, passwordHash });

  return NextResponse.json({ ok: true });
}
