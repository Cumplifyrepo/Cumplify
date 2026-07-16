import { connect } from 'framer-api';

const framer = await connect(process.env.FRAMER_PROJECT_URL, process.env.FRAMER_API_KEY);
const info = await framer.getProjectInfo();
console.log(JSON.stringify(info, null, 2));
await framer.disconnect();
