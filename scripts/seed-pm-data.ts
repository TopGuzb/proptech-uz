/**
 * PropTech UZ — Property Management Seed Script
 *
 * Заполняет PM таблицы тестовыми данными:
 * - 5 vendors (подрядчики)
 * - До 10 residents (жильцы для существующих квартир)
 * - 3 счётчика на квартиру (электричество, газ, вода)
 * - 5 базовых тарифов
 * - 5 communal assets для существующих зданий
 * - 1 активный poll
 *
 * Запуск: npx tsx scripts/seed-pm-data.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load .env.local
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  console.log('🌱 Starting PM seed...\n');

  // ============================================
  // 1. Get existing apartments (max 10)
  // ============================================
  const { data: apartments, error: apartmentsError } = await supabase
    .from('apartments')
    .select('id, building_id')
    .limit(10);

  if (apartmentsError || !apartments || apartments.length === 0) {
    console.error('❌ No apartments found. Create apartments first.');
    console.error(apartmentsError);
    process.exit(1);
  }

  console.log(`✅ Found ${apartments.length} apartments to seed against\n`);

  // ============================================
  // 2. Get existing buildings (for communal assets)
  // ============================================
  const { data: buildings } = await supabase
    .from('buildings')
    .select('id')
    .limit(3);

  if (!buildings || buildings.length === 0) {
    console.error('❌ No buildings found.');
    process.exit(1);
  }

  // ============================================
  // 3. Seed Vendors
  // ============================================
  const vendorsData = [
    {
      name: 'Алишер Каримов',
      phone: '+998901234567',
      specializations: ['electrical'],
      rating: 4.8,
      total_jobs: 45,
      completed_jobs: 43,
      notes: 'Опытный электрик, работает с 2018',
    },
    {
      name: 'Бекзод Юсупов',
      phone: '+998935551234',
      specializations: ['plumbing'],
      rating: 4.6,
      total_jobs: 38,
      completed_jobs: 36,
      notes: 'Сантехник, специалист по разводке труб',
    },
    {
      name: 'Озодбек Раҳимов',
      phone: '+998977778899',
      specializations: ['cleaning'],
      rating: 4.9,
      total_jobs: 120,
      completed_jobs: 119,
      notes: 'Клининговая бригада из 3 человек',
    },
    {
      name: 'Дилшод Хамидов',
      phone: '+998901112233',
      specializations: ['elevator'],
      rating: 4.7,
      total_jobs: 22,
      completed_jobs: 21,
      notes: 'Лифтовый мастер, сертифицирован',
    },
    {
      name: 'Жасур Алимов',
      phone: '+998935554466',
      specializations: ['plumbing', 'electrical', 'heating'],
      rating: 4.5,
      total_jobs: 67,
      completed_jobs: 64,
      notes: 'Универсальный мастер',
    },
  ];

  const { data: vendors, error: vendorsError } = await supabase
    .from('vendors')
    .insert(vendorsData)
    .select();

  if (vendorsError) {
    console.error('❌ Failed to create vendors:', vendorsError);
  } else {
    console.log(`✅ Created ${vendors?.length || 0} vendors`);
  }

  // ============================================
  // 4. Seed Residents
  // ============================================
  const residentNames = [
    { name: 'Шохрух Мухиддинов', phone: '+998901234500', tg: 'shox_uz' },
    { name: 'Анна Иванова', phone: '+998935551111', tg: 'anna_iv' },
    { name: 'Бахтиёр Усмонов', phone: '+998977772222', tg: 'baxtiyor' },
    { name: 'Мария Петрова', phone: '+998901113333', tg: 'maria_p' },
    { name: 'Дилноза Каримова', phone: '+998935554444', tg: 'dilnoza_k' },
    { name: 'Сергей Смирнов', phone: '+998977775555', tg: 'sergey_s' },
    { name: 'Жасмина Алиева', phone: '+998901116666', tg: 'jasmina_a' },
    { name: 'Иван Кузнецов', phone: '+998935557777', tg: 'ivan_k' },
    { name: 'Гулнора Тошева', phone: '+998977778888', tg: 'gulnora_t' },
    { name: 'Алексей Попов', phone: '+998901119999', tg: 'alex_p' },
  ];

  const residentsData = apartments.map((apt, idx) => {
    const r = residentNames[idx % residentNames.length];
    return {
      apartment_id: apt.id,
      full_name: r.name,
      phone: r.phone,
      email: `${r.tg}@example.com`,
      telegram_username: r.tg,
      resident_type: 'owner' as const,
      move_in_date: '2024-01-15',
      is_active: true,
    };
  });

  const { data: residents, error: residentsError } = await supabase
    .from('residents')
    .insert(residentsData)
    .select();

  if (residentsError) {
    console.error('❌ Failed to create residents:', residentsError);
  } else {
    console.log(`✅ Created ${residents?.length || 0} residents`);
  }

  // ============================================
  // 5. Seed Utility Meters (3 на квартиру)
  // ============================================
  const metersData: any[] = [];
  for (const apt of apartments) {
    metersData.push(
      {
        apartment_id: apt.id,
        meter_type: 'electricity',
        serial_number: `EL-${apt.id.slice(0, 8)}`,
        unit: 'kWh',
        installed_date: '2024-01-01',
        initial_reading: 0,
      },
      {
        apartment_id: apt.id,
        meter_type: 'gas',
        serial_number: `GAS-${apt.id.slice(0, 8)}`,
        unit: 'm³',
        installed_date: '2024-01-01',
        initial_reading: 0,
      },
      {
        apartment_id: apt.id,
        meter_type: 'water_cold',
        serial_number: `WC-${apt.id.slice(0, 8)}`,
        unit: 'm³',
        installed_date: '2024-01-01',
        initial_reading: 0,
      }
    );
  }

  const { data: meters, error: metersError } = await supabase
    .from('utility_meters')
    .insert(metersData)
    .select();

  if (metersError) {
    console.error('❌ Failed to create meters:', metersError);
  } else {
    console.log(`✅ Created ${meters?.length || 0} utility meters`);
  }

  // ============================================
  // 6. Seed Utility Rates
  // ============================================
  const ratesData = [
    { meter_type: 'electricity', rate_per_unit: 295.0, currency: 'UZS', effective_from: '2025-01-01' },
    { meter_type: 'gas', rate_per_unit: 380.0, currency: 'UZS', effective_from: '2025-01-01' },
    { meter_type: 'water_cold', rate_per_unit: 1850.0, currency: 'UZS', effective_from: '2025-01-01' },
    { meter_type: 'water_hot', rate_per_unit: 5200.0, currency: 'UZS', effective_from: '2025-01-01' },
    { meter_type: 'heating', rate_per_unit: 420.0, currency: 'UZS', effective_from: '2025-01-01' },
  ];

  const { data: rates, error: ratesError } = await supabase
    .from('utility_rates')
    .insert(ratesData)
    .select();

  if (ratesError) {
    console.error('❌ Failed to create rates:', ratesError);
  } else {
    console.log(`✅ Created ${rates?.length || 0} utility rates`);
  }

  // ============================================
  // 7. Seed Communal Assets
  // ============================================
  const firstBuildingId = buildings[0].id;
  const communalData = [
    {
      building_id: firstBuildingId,
      asset_type: 'elevator',
      name: 'Лифт №1',
      description: 'Пассажирский лифт OTIS, 8 этажей',
      status: 'operational',
      last_inspection_date: '2026-03-15',
      next_inspection_date: '2026-09-15',
    },
    {
      building_id: firstBuildingId,
      asset_type: 'entrance',
      name: 'Подъезд №1',
      description: 'Главный вход с домофоном',
      status: 'operational',
      last_inspection_date: '2026-04-01',
      next_inspection_date: '2026-10-01',
    },
    {
      building_id: firstBuildingId,
      asset_type: 'parking',
      name: 'Подземная парковка',
      description: '40 машиномест',
      status: 'operational',
      last_inspection_date: '2026-04-10',
      next_inspection_date: '2026-10-10',
    },
    {
      building_id: firstBuildingId,
      asset_type: 'playground',
      name: 'Детская площадка',
      description: 'Игровая зона во дворе',
      status: 'operational',
      last_inspection_date: '2026-03-20',
      next_inspection_date: '2026-09-20',
    },
    {
      building_id: firstBuildingId,
      asset_type: 'facade',
      name: 'Фасад здания',
      description: 'Северная и южная стороны',
      status: 'operational',
      last_inspection_date: '2025-11-01',
      next_inspection_date: '2026-11-01',
    },
  ];

  const { data: communal, error: communalError } = await supabase
    .from('communal_assets')
    .insert(communalData)
    .select();

  if (communalError) {
    console.error('❌ Failed to create communal assets:', communalError);
  } else {
    console.log(`✅ Created ${communal?.length || 0} communal assets`);
  }

  // ============================================
  // 8. Seed Poll
  // ============================================
  const pollEnd = new Date();
  pollEnd.setDate(pollEnd.getDate() + 14);

  const { data: poll, error: pollError } = await supabase
    .from('polls')
    .insert({
      building_id: firstBuildingId,
      title: 'Установка камер видеонаблюдения в подъезде',
      description: 'Уважаемые жильцы! Предлагаем рассмотреть установку 4 камер видеонаблюдения в подъезде и парковке. Стоимость на одну квартиру — 250,000 UZS единоразово.',
      options: [
        { id: 1, label: 'За — установить камеры' },
        { id: 2, label: 'Против' },
        { id: 3, label: 'Воздерживаюсь' },
      ],
      starts_at: new Date().toISOString(),
      ends_at: pollEnd.toISOString(),
      is_active: true,
    })
    .select();

  if (pollError) {
    console.error('❌ Failed to create poll:', pollError);
  } else {
    console.log(`✅ Created ${poll?.length || 0} active poll`);
  }

  console.log('\n🎉 Seed completed!');
}

main().catch((err) => {
  console.error('💥 Seed failed:', err);
  process.exit(1);
});
