export const notificationLocales = ["en", "ti"] as const;
export type NotificationLocale = (typeof notificationLocales)[number];

export const notificationCatalogs = {
  en: {
    inquiry: {
      created: {
        subject: "New Betna inquiry {reference}",
        body: "Betna received inquiry {reference}. We review inquiries during business hours; urgent cases may be handled by staff outside those hours.",
      },
      ownerConfirmed: {
        body: "The owner has confirmed inquiry {reference}.",
      },
      ownerDeclined: {
        body: "The owner has declined inquiry {reference}.",
      },
      locationApproved: {
        body: "Betna approved the protected location for inquiry {reference}.",
      },
    },
    availability: {
      autoDeclined: {
        subject: "Betna update for inquiry {reference}",
        body: "The dates requested in inquiry {reference} are no longer available because another inquiry was confirmed.",
      },
    },
    auth: {
      ownerEmailVerification: {
        subject: "Verify your Betna owner account",
        body: "Your Betna owner verification code is {code}. It expires in 10 minutes.",
      },
    },
    system: {
      generic: { subject: "Betna notification", body: "Betna update{referenceSuffix}." },
    },
    contact: {
      owner: { body: "Hello, I am asking about {propertyTitle} on Betna." },
    },
  },
  ti: {
    inquiry: {
      created: {
        subject: "ሓድሽ ሕቶ Betna {reference}",
        body: "Betna ሕቶ {reference} ተቐቢላ። ሕቶታት ኣብ ሰዓታት ስራሕ ንግምግም፤ ኣድላዪ እንተኾይኑ ሰራሕተኛታት ወጻኢ እዋን ስራሕ ክሕግዙ ይኽእሉ።",
      },
      ownerConfirmed: {
        body: "ባለቤት ሕቶ {reference} ኣረጋጊጹ።",
      },
      ownerDeclined: {
        body: "ባለቤት ሕቶ {reference} ነጺጉ።",
      },
      locationApproved: {
        body: "Betna ንሕቶ {reference} ዕቑብ ቦታ ኣጽዲቓቶ።",
      },
    },
    availability: {
      autoDeclined: {
        subject: "ሓበሬታ Betna ንሕቶ {reference}",
        body: "ኣብ ሕቶ {reference} ዝተሓተቱ ዕለታት ሓደ ካልእ ሕቶ ስለ ዝተረጋገጸ ደጊም ኣይርከቡን።",
      },
    },
    auth: {
      ownerEmailVerification: {
        subject: "ሒሳብ ባለቤት Betna ኣረጋግጽ",
        body: "ኮድ ምርግጋጽ ባለቤት Betnaኻ {code} እዩ። ኣብ 10 ደቓይቕ ይውዳእ።",
      },
    },
    system: {
      generic: { subject: "ሓበሬታ Betna", body: "ሓበሬታ Betna{referenceSuffix}።" },
    },
    contact: {
      owner: { body: "ሰላም፣ ብዛዕባ {propertyTitle} ኣብ Betna ክሓትት እየ።" },
    },
  },
} as const;

export type NotificationTemplateKey =
  | "inquiry.created"
  | "inquiry.ownerConfirmed"
  | "inquiry.ownerDeclined"
  | "inquiry.locationApproved"
  | "availability.autoDeclined"
  | "auth.ownerEmailVerification"
  | "system.generic"
  | "contact.owner";

type NotificationValues = Record<string, string | number | undefined>;

export function normalizeNotificationLocale(value?: string | null): NotificationLocale {
  return String(value ?? "").toLowerCase().replace("_", "-").split("-")[0] === "ti" ? "ti" : "en";
}

function template(locale: NotificationLocale, key: NotificationTemplateKey, part: "subject" | "body") {
  const [group, name] = key.split(".") as [keyof typeof notificationCatalogs.en, string];
  const localizedGroup = notificationCatalogs[locale][group] as Record<string, Record<string, string>>;
  const fallbackGroup = notificationCatalogs.en[group] as Record<string, Record<string, string>>;
  return localizedGroup?.[name]?.[part] ?? fallbackGroup?.[name]?.[part] ?? "Betna notification";
}

function interpolate(value: string, values: NotificationValues) {
  return value.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

export function notificationMessage(
  locale: string | null | undefined,
  key: NotificationTemplateKey,
  values: NotificationValues = {},
) {
  const normalized = normalizeNotificationLocale(locale);
  const subject = template(normalized, key, "subject");
  const body = template(normalized, key, "body");
  return {
    ...(subject === "Betna notification" && !hasSubject(key) ? {} : { subject: interpolate(subject, values) }),
    body: interpolate(body, values),
  };
}

function hasSubject(key: NotificationTemplateKey) {
  return Boolean((notificationCatalogs.en as any)[key.split(".")[0]]?.[key.split(".")[1]]?.subject);
}
