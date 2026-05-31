import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, UserDoc } from "@/lib/types";
import { credentialsSchema } from "@/lib/validation";
import { setSession } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { user, password } = parsed.data;

  const db = await getDb();
  const doc = await db
    .collection<UserDoc>(COLLECTIONS.users)
    .findOne({ name: user });

  if (!doc || !(await bcrypt.compare(password, doc.passwordHash))) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  }

  const userId = doc._id!.toString();
  await setSession({ userId, name: doc.name });

  return NextResponse.json({ ok: true, _id: userId, name: doc.name });
}
