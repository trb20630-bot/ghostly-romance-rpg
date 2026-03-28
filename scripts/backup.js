const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TABLES = [
  'game_sessions',
  'conversation_logs',
  'player_stats',
  'player_stats_history',
  'player_memory',
  'token_usage'
];

const KEEP_DAYS = 3;
const BUCKET_NAME = 'backups';

async function ensureBucketExists() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET_NAME);

  if (!exists) {
    await supabase.storage.createBucket(BUCKET_NAME, { public: false });
    console.log(`Created bucket: ${BUCKET_NAME}`);
  }
}

async function backup() {
  await ensureBucketExists();

  const date = new Date().toISOString().split('T')[0];
  const backupData = {};

  for (const table of TABLES) {
    console.log(`Backing up ${table}...`);

    const { data, error } = await supabase
      .from(table)
      .select('*');

    if (error) {
      console.error(`Error backing up ${table}:`, error.message);
      backupData[table] = { error: error.message };
      continue;
    }

    backupData[table] = data;
    console.log(`  ${table}: ${data.length} rows`);
  }

  // Upload to Supabase Storage
  const fileName = `backup-${date}.json`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, JSON.stringify(backupData, null, 2), {
      contentType: 'application/json',
      upsert: true
    });

  if (uploadError) {
    console.error('Upload error:', uploadError.message);
    process.exit(1);
  }

  console.log(`Uploaded: ${fileName}`);

  // Clean old backups (keep last KEEP_DAYS)
  await cleanOldBackups();

  console.log('Backup complete!');
}

async function cleanOldBackups() {
  const { data: files } = await supabase.storage
    .from(BUCKET_NAME)
    .list();

  if (!files || files.length <= KEEP_DAYS) return;

  const sorted = files
    .filter(f => f.name.startsWith('backup-'))
    .sort((a, b) => a.name.localeCompare(b.name));

  while (sorted.length > KEEP_DAYS) {
    const oldest = sorted.shift();
    await supabase.storage.from(BUCKET_NAME).remove([oldest.name]);
    console.log(`Deleted old backup: ${oldest.name}`);
  }
}

backup().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
