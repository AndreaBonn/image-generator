// What each license id in config/models.yaml means for using the images (I3); the id stays in brackets.
const LICENSE_WORDS: Record<string, string> = {
  "apache-2.0": "Libera, anche commerciale (Apache 2.0)",
  mit: "Libera, anche commerciale (MIT)",
  "openrail++": "Libera, con alcuni divieti d'uso (OpenRAIL++)",
  "cc-by-nc-sa-4.0": "Solo uso non commerciale (CC BY-NC-SA 4.0)",
};

/** A license id said in plain words; licenses already written as a sentence pass through. */
export function licenseLabel(raw: string): string {
  return LICENSE_WORDS[raw.toLowerCase()] ?? raw;
}
