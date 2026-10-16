import journal from './meta/_journal.json';
import m0000 from './0000_baseline.sql';
import m0001 from './0001_add-maintenance-settings.sql';
import m0002 from './0002_add-customer-sites.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002
    }
  }
  