import { redirect } from "next/navigation";

// Editar perfil ahora está dentro de "Tu tienda" (una sola página, como en el prototipo).
export default function PerfilTienda() {
  redirect("/vendedor/tienda");
}
