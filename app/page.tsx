import { getCurrentUser } from "./auth-user";
import Checkbook from "./checkbook";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  return <Checkbook user={user ? { id: user.userId, name: user.displayName } : null} signInPath="/auth" signOutPath="/api/auth/signout" />;
}
