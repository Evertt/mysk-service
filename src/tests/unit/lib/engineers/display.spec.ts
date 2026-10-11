import { specialtyOptions } from "#lib/engineers/display.ts";
import { engineerSpecialties } from "#lib/models.ts";

import { describeOptions } from "../display.test-support.ts";

describeOptions("engineer specialties", specialtyOptions, engineerSpecialties);
