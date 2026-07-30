import OrderDetailClient from "./OrderDetailClient";

// עמוד שרת דק סביב הרכיב: כל מה שהוא עושה הוא לפתוח את ה-`params`. השער יושב
// ב-layout של `/admin`, ולכן אין כאן שום עטיפה נוספת לזכור.
export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetailClient id={id} />;
}
