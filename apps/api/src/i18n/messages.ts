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
        subject: "Betna inquiry confirmed {reference}",
        body: "The owner has confirmed inquiry {reference}.",
      },
      ownerDeclined: {
        subject: "Betna inquiry update {reference}",
        body: "The owner has declined inquiry {reference}.",
      },
      locationApproved: {
        subject: "Betna protected location approved {reference}",
        body: "Betna approved the protected location for inquiry {reference}. Open this secure link to view it before it expires at {expiresAt}: {redemptionUrl}",
      },
      guestSuccess: {
        subject: "Betna inquiry received {reference}",
        body: "Betna received inquiry {reference}. We review inquiries during configured business hours.",
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
      ownerPhoneOtp: {
        subject: "Your Betna WhatsApp verification code",
        body: "Your Betna WhatsApp verification code is {code}. It expires at {expiresAt}.",
      },
    },
    system: {
      generic: {
        subject: "Betna notification",
        body: "Betna update{referenceSuffix}.",
      },
    },
    contact: {
      owner: { body: "Hello, I am asking about {propertyTitle} on Betna." },
    },
    verification: {
      assigned: {
        subject: "Betna inspection assigned",
        body: "A Betna inspection has been assigned to you.",
      },
      submitted: {
        subject: "Betna inspection submitted",
        body: "A Betna inspection report is ready for staff review.",
      },
      approved: {
        subject: "Betna inspection approved",
        body: "Your Betna inspection report was approved.",
      },
      rejected: {
        subject: "Betna inspection needs attention",
        body: "Your Betna inspection report needs attention and may be resubmitted.",
      },
    },
  },
  ti: {
    inquiry: {
      created: {
        subject: "ሓድሽ ሕቶ Betna {reference}",
        body: "Betna ሕቶ {reference} ተቐቢላ። ሕቶታት ኣብ ሰዓታት ስራሕ ንግምግም፤ ኣድላዪ እንተኾይኑ ሰራሕተኛታት ወጻኢ እዋን ስራሕ ክሕግዙ ይኽእሉ።",
      },
      ownerConfirmed: {
        subject: "ሕቶ Betna ተረጋጊጹ {reference}",
        body: "ባለቤት ሕቶ {reference} ኣረጋጊጹ።",
      },
      ownerDeclined: {
        subject: "ሓበሬታ ሕቶ Betna {reference}",
        body: "ባለቤት ሕቶ {reference} ነጺጉ።",
      },
      locationApproved: {
        subject: "ዕቑብ ቦታ ሕቶ Betna ጸዲቑ {reference}",
        body: "Betna ንሕቶ {reference} ዕቑብ ቦታ ኣጽዲቓቶ። ቅድሚ እዋኑ ምውዳእ ነዚ ውሑስ መላግቦ ብምኽፋት ርአዮ፣ {expiresAt}: {redemptionUrl}",
      },
      guestSuccess: {
        subject: "ሕቶ Betna ተቐቢልና {reference}",
        body: "Betna ሕቶ {reference} ተቐቢላ። ሕቶታት ኣብ ዝተወሰነ ሰዓታት ስራሕ ንግምግም።",
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
      ownerPhoneOtp: {
        subject: "ኮድ ምርግጋጽ WhatsApp Betna",
        body: "ኮድ ምርግጋጽ WhatsApp Betnaኻ {code} እዩ። ክሳብ {expiresAt} ይጸንሕ።",
      },
    },
    system: {
      generic: { subject: "ሓበሬታ Betna", body: "ሓበሬታ Betna{referenceSuffix}።" },
    },
    contact: {
      owner: { body: "ሰላም፣ ብዛዕባ {propertyTitle} ኣብ Betna ክሓትት እየ።" },
    },
    verification: {
      assigned: { subject: "ምርመራ Betna ተመዲቡ", body: "ምርመራ Betna ንኣኻ ተመዲቡ።" },
      submitted: {
        subject: "ምርመራ Betna ቀሪቡ",
        body: "ጸብጻብ ምርመራ Betna ንግምገማ ሰራሕተኛታት ድሉው እዩ።",
      },
      approved: { subject: "ምርመራ Betna ጸዲቑ", body: "ጸብጻብ ምርመራ Betnaኻ ጸዲቑ።" },
      rejected: {
        subject: "ምርመራ Betna ተወሳኺ ስራሕ የድሊ",
        body: "ጸብጻብ ምርመራ Betnaኻ ተወሳኺ ስራሕ የድሊ።",
      },
    },
  },
} as const;

export type NotificationTemplateKey =
  | "inquiry.created"
  | "inquiry.ownerConfirmed"
  | "inquiry.ownerDeclined"
  | "inquiry.locationApproved"
  | "inquiry.guestSuccess"
  | "availability.autoDeclined"
  | "auth.ownerEmailVerification"
  | "auth.ownerPhoneOtp"
  | "system.generic"
  | "contact.owner"
  | "verification.assigned"
  | "verification.submitted"
  | "verification.approved"
  | "verification.rejected";

type NotificationValues = Record<string, string | number | undefined>;

export function normalizeNotificationLocale(
  value?: string | null,
): NotificationLocale {
  return String(value ?? "")
    .toLowerCase()
    .replace("_", "-")
    .split("-")[0] === "ti"
    ? "ti"
    : "en";
}

function template(
  locale: NotificationLocale,
  key: NotificationTemplateKey,
  part: "subject" | "body",
) {
  const [group, name] = key.split(".") as [
    keyof typeof notificationCatalogs.en,
    string,
  ];
  const localizedGroup = notificationCatalogs[locale][group] as Record<
    string,
    Record<string, string>
  >;
  return localizedGroup?.[name]?.[part] ?? "Betna notification";
}

function interpolate(value: string, values: NotificationValues) {
  return value.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key: string) =>
    String(values[key] ?? `{${key}}`),
  );
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
    ...(subject === "Betna notification" && !hasSubject(key)
      ? {}
      : { subject: interpolate(subject, values) }),
    body: interpolate(body, values),
  };
}

function hasSubject(key: NotificationTemplateKey) {
  return Boolean(
    (notificationCatalogs.en as any)[key.split(".")[0]]?.[key.split(".")[1]]
      ?.subject,
  );
}
