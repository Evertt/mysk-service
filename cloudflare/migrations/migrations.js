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
import m0009 from './0009_add-condition.sql';
import m0010 from './0010_add-docks.sql';
import m0011 from './0011_add-customer-portal.sql';
import m0012 from './0012_add-energy.sql';
import m0013 from './0013_add-order-type-settings.sql';
import m0014 from './0014_add-credit-notes.sql';
import m0015 from './0015_add-parts-shop.sql';
import m0016 from './0016_index-foreign-keys.sql';
import m0017 from './0017_add-checklist-template-item.sql';
import m0018 from './0018_add-components.sql';
import m0019 from './0019_add-simulation.sql';
import m0020 from './0020_add-checklist-completed-by-user.sql';
import m0021 from './0021_dock-last-event-in-ms.sql';
import m0022 from './0022_hourly-energy-alerts.sql';

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
m0008,
m0009,
m0010,
m0011,
m0012,
m0013,
m0014,
m0015,
m0016,
m0017,
m0018,
m0019,
m0020,
m0021,
m0022
    }
  }
  