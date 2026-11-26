import { writeFile } from "node:fs/promises";
import { demoData } from "../shared/data";
writeFile("demo-dataset.json", JSON.stringify(demoData, null, 2))
  .then(() =>
    console.log(
      "Created synthetic demo-dataset.json. Never relabel as verified.",
    ),
  )
  .catch(() => {
    console.error("Could not write seed");
    process.exitCode = 1;
  });
