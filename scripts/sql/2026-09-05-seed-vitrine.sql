-- ============================================================================
-- HOUSE-ZEN — Seed vitrine : description + photos (démo commerciale)
-- Zen Palace Douala + ses 3 types de chambres/appartements.
-- Ré-exécutable (SET à chaque fois).
-- ============================================================================
update properties set
  description = 'Au cœur de Douala, le Zen Palace combine hébergement élégant et art de vivre camerounais : chambres climatisées, wifi fibre, restaurant, piscine, parking sécurisé et réception 24h/24. Salles de réception et espaces de travail disponibles sur demande.',
  photos = array[
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1600&q=80',
    'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=1600&q=80'
  ]
where slug = 'zen-palace-douala';

update room_types set
  photos = array[
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80'
  ]
where name = 'Standard'
  and property_id = (select id from properties where slug = 'zen-palace-douala');

update room_types set
  photos = array[
    'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1595576508898-0ad5c879a061?auto=format&fit=crop&w=1200&q=80'
  ]
where name = 'Executive'
  and property_id = (select id from properties where slug = 'zen-palace-douala');

update room_types set
  photos = array[
    'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80'
  ]
where name = 'Suite Présidentielle'
  and property_id = (select id from properties where slug = 'zen-palace-douala');

select p.name, p.is_published, array_length(p.photos, 1) as photos,
       (select count(*) from room_types rt where rt.property_id = p.id) as room_types
from properties p where p.slug = 'zen-palace-douala';
