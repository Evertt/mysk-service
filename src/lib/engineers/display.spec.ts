import { engineerSpecialties } from "#lib/models.ts";

import { describeOptions } from "../display.test-support.ts";
import { specialtyOptions } from "./display.ts";

describeOptions("engineer specialties", specialtyOptions, engineerSpecialties);
