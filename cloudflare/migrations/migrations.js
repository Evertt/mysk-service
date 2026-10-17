import journal from './meta/_journal.json';
import m0000 from './0000_baseline.sql';
import m0001 from './0001_add-maintenance-settings.sql';
import m0002 from './0002_add-customer-sites.sql';
import m0003 from './0003_equipment-categories.sql';
import m0004 from './0004_order-units.sql';
import m0005 from './0005_add-checklist-templates.sql';
import m0006 from './0006_add-checklists.sql';
import m0007 from './0007_equipment-locations.sql';
import m0008 from './0008_add-partner-programme.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007,
m0008
    }
  }
  