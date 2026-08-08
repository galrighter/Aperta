import UserDetailClient from "./UserDetailClient";

// עמוד שרת דק סביב הרכיב, כמו במסך ההזמנה: כל מה שהוא עושה הוא לפתוח את
// ה-`params`. השער יושב ב-layout של `/admin`, ולכן אין כאן עטיפה לזכור.
export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserDetailClient id={id} />;
}
