-- Seed data: Greater Tripoli regions
-- Coordinates are approximate area centers (assumption: precise enough for
-- region auto-suggestion and map centering; not survey-grade). Easy to add
-- more regions later via the admin "manage regions" screen or another
-- migration / INSERT statement.

INSERT OR IGNORE INTO regions (slug, name_ar, name_en, city, center_lat, center_lng) VALUES
  ('tajoura',        'تاجوراء',        'Tajoura',          'Greater Tripoli', 32.8811, 13.3502),
  ('souq-al-jumaa',  'سوق الجمعة',     'Souq Al-Jumaa',    'Greater Tripoli', 32.8756, 13.2333),
  ('ain-zara',       'عين زارة',       'Ain Zara',         'Greater Tripoli', 32.8064, 13.2394),
  ('qasr-bin-ghashir','قصر بن غشير',   'Qasr Bin Ghashir', 'Greater Tripoli', 32.7333, 13.1667),
  ('as-sawani',      'السواني',        'As-Sawani',        'Greater Tripoli', 32.7167, 13.1167),
  ('janzour',        'جنزور',          'Janzour',          'Greater Tripoli', 32.8000, 13.0167),
  ('andalus',        'حي الأندلس',     'Hai Al-Andalus',   'Greater Tripoli', 32.8500, 13.1667),
  ('siyahiya',       'السياحية',       'As-Siyahiya',      'Greater Tripoli', 32.8600, 13.1500),
  ('abu-salim',      'أبوسليم',        'Abu Salim',        'Greater Tripoli', 32.8333, 13.2000),
  ('hadaba',         'الحدبة',         'Al-Hadaba',        'Greater Tripoli', 32.8450, 13.1750),
  ('gorgaresh',      'قرقارش',         'Gorgaresh',        'Greater Tripoli', 32.8600, 13.1300),
  ('dreibi',         'الدريبي',        'Al-Dreibi',        'Greater Tripoli', 32.8700, 13.1900),
  ('tripoli-center', 'وسط طرابلس',     'Central Tripoli',  'Greater Tripoli', 32.8872, 13.1913),
  ('bab-bin-ghashir','باب بن غشير',    'Bab Bin Ghashir',  'Greater Tripoli', 32.8200, 13.2100),
  ('sidi-al-masri',  'سيدي المصري',    'Sidi Al-Masri',    'Greater Tripoli', 32.8450, 13.2450),
  ('al-furnaj',      'الفرناج',        'Al-Furnaj',        'Greater Tripoli', 32.8800, 13.1700),
  ('ghout-al-shaal', 'غوط الشعال',     'Ghout Al-Shaal',   'Greater Tripoli', 32.8950, 13.1550);
