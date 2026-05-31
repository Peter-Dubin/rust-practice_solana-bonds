import Link from "next/link";
import { getUsers, addUser } from "./actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const users = await getUsers();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Users</h1>

      <form action={addUser} className="flex gap-2">
        <input
          name="name"
          placeholder="New user name"
          className="rounded bg-zinc-800 px-3 py-2 text-sm outline-none"
        />
        <button className="rounded bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-500">
          Add user
        </button>
      </form>

      {users.length === 0 ? (
        <p className="text-zinc-500">No users yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-zinc-400">
            <tr className="border-b border-zinc-800">
              <th className="py-2">Name</th>
              <th className="py-2">ID</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id} className="border-b border-zinc-900">
                <td className="py-2">{u.name}</td>
                <td className="py-2 font-mono text-xs text-zinc-500">{u._id}</td>
                <td className="py-2 text-right">
                  <Link
                    href={`/users/${u._id}`}
                    className="text-emerald-400 hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
