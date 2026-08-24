-- Echte Google-Bewertungen von GiGi Beauty, ausgewählt von Marcel/Liliane.
-- Eine repräsentative Auswahl von 7 (nicht alle vorhandenen), damit der
-- Bereich auf der Startseite übersichtlich bleibt. Weitere lassen sich
-- jederzeit im Dashboard unter "Website-Inhalte" -> "Kundenstimmen"
-- ergänzen, bearbeiten oder ausblenden.

insert into public.testimonials (customer_name, rating, quote, service_name, sort_order, active) values
  ('Anni X.', 5, 'Ich gehe super gerne zu Liliane. Sie arbeitet sehr sauber und genau, und meine Nägel halten jedes Mal richtig lange. Auch nach mehreren Wochen sehen sie noch schön aus. Besonders mag ich, dass sie mich ehrlich berät und sagt auch, welche Farben oder Formen wirklich gut zu den eigenen Händen passen. Kann sie von Herzen weiterempfehlen.', 'Modellierte Nägel', 1, true),
  ('Michèle Carole', 5, 'Ich bin seit etwa 1,5 Jahren regelmässig bei GiGi Beauty und bin jedes Mal sehr zufrieden. Die Behandlungen werden immer professionell und mit viel Sorgfalt durchgeführt. Man fühlt sich sofort wohl und gut aufgehoben. Das Ergebnis ist immer top – ich kann GiGi Beauty wirklich nur weiterempfehlen!', 'Modellierte Nägel', 2, true),
  ('Vanessa', 5, 'Liebe Lili! Wiederum ein tolles Resultat an meinen Füssen! Die Nägel sehen super aus, halten lange und auch kleine natürliche Asymmetrien werden durch dein Können weggezaubert. Vielen Dank dafür. Bis bald.', 'Nagellackierung', 3, true),
  ('Claudia Bonetti', 5, 'GiGi macht die schönsten und perfektesten Nägel und verwendet dabei Material in super Qualität. Als Mensch ist sie der Hammer. Aufgestellt und offen. Keine macht so schöne Nägel wie sie.', 'Modellierte Nägel', 4, true),
  ('Nadine Trachsel', 5, 'Ich kam vor ca. 14 Jahren zu Lily als Kundin und bin heute noch da – inklusive Upgrade nun als Freundin. Dies sagt glaube ich viel aus! Danke Lily für deine tolle Arbeit!', 'Modellierte Nägel', 5, true),
  ('Andrea Bichsel', 5, 'Ich gehe seit 13 Jahren zu Lili. Ich möchte von niemand anderem meine Nägel machen lassen! Freue mich jedes Mal über das schöne Ergebnis. Auch das Lachen kommt nicht zu kurz, es ist immer fägig mit Lili.', 'Gelnägel', 6, true),
  ('Sandra Studer', 5, 'Als langjährige Kundin kann ich GiGi Beauty wärmstens empfehlen. Lili macht die schönsten Nägel weit und breit.', 'Modellierte Nägel', 7, true);
