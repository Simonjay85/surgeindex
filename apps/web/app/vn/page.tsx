import { permanentRedirect } from "next/navigation";

// /vn has no page of its own yet; the Surge Story index lives at /vn/stories.
export default function VnIndexPage() {
  permanentRedirect("/vn/stories");
}
