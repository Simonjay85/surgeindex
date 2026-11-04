import { permanentRedirect } from "next/navigation";

export const metadata = { title: "Fanward" };

export default function CreatorsPage() {
  permanentRedirect("/fanward");
}
