import Link from "next/link";
import { he } from "@/i18n/he";

const s = he.site;

// `link` אופציונלי לסעיף: סעיף שמטיל חובה ("תחזוקה ראויה כמפורט בעמוד
// התחזוקה") חייב להוביל למקום שבו כתוב מה החובה. בלי זה הסעיף מפנה לעמוד
// שהלקוחה צריכה לחפש לבד, וזו הסתייגות ולא הוראה.
type Section = {
  readonly h: string;
  readonly p: string;
  readonly link?: { readonly href: string; readonly label: string };
};

export default function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: readonly Section[];
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16 sm:px-10">
      <h1 className="text-[32px] font-semibold tracking-tight text-graphite sm:text-[40px]">
        {title}
      </h1>
      <p className="mt-2 text-sm text-mist">{s.legalUpdated}</p>
      <p className="mt-6 leading-relaxed text-ink80">{intro}</p>

      <div className="mt-8 flex flex-col gap-6">
        {sections.map((sec, i) => (
          <section key={i}>
            <h2 className="text-lg font-semibold text-graphite">{sec.h}</h2>
            <p className="mt-1 leading-relaxed text-ink60">
              {sec.p}
              {sec.link && (
                <>
                  {" "}
                  <Link
                    href={sec.link.href}
                    className="font-medium text-lapis hover:underline"
                  >
                    {sec.link.label}
                  </Link>
                </>
              )}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
