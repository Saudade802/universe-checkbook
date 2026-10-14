import { localPreviewEnabled } from "../../lib/supabase/config";
import AuthForm from "./auth-form";

export const dynamic = "force-dynamic";
export default function AuthPage() { return <AuthForm localPreview={localPreviewEnabled()} />; }
