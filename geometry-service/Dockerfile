# מנוע הגיאומטריה כשירות — רץ על הקופסה לצד ה-vectorizer.
#
# מקבל bundle מוכן (dist/server.js), לא מקור: הקוד נארז ב-esbuild בזמן הפריסה
# מתוך src/lib/geometry, כך שאין כאן עותק שני של חוקי הייצור ואין צורך ב-npm
# install על הקופסה. התלויות (polygon-clipping, clipper-lib, fast-xml-parser)
# כבר בתוך ה-bundle.
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

COPY dist/server.js ./server.js

EXPOSE 8100
CMD ["node", "server.js"]
