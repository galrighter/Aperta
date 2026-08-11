import DesignDetailClient from "./DesignDetailClient";

// עמוד שרת דק סביב הרכיב, כמו במשתמש ובהזמנה: כל מה שהוא עושה הוא לפתוח את
// ה-`params`. השער יושב ב-layout של `/admin`.
export default async function AdminDesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DesignDetailClient id={id} />;
}
