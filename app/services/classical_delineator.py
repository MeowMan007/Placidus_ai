"""
Classical Hellenistic Astrological Delineation Engine
An in-depth, standalone astrological reasoning and delineation system based on:
- Demetra George (Astrology and the Authentic Self / Ancient Astrology in Theory & Practice)
- Vettius Valens (Anthologies)
- Claudius Ptolemy (Tetrabiblos)

Generates dynamic, deeply personalized astrological readings without external API dependencies.
"""

import re
from typing import Dict, List, Optional, Any, Tuple

# ─────────────────────────────────────────────────────────────────────────────
# 1. ARCHETYPAL CORE DEFINITIONS
# ─────────────────────────────────────────────────────────────────────────────

PLANET_ARCHETYPES = {
    "Sun": {
        "title": "The Solar Core & Sovereign Will",
        "archetype": "Conscious identity, heroic individuation, creative vitality, and central life purpose.",
        "sect_role": "Diurnal Luminary — Ruler of the day sect; shines conscious light and clear perception.",
        "psychological": "Your drive to be recognized as an authentic, unique individual. Where you express creative radiance and sovereign autonomy.",
        "shadow": "Egoic inflation, fear of mediocrity, arrogance, or conversely, dimming one's light to avoid scrutiny.",
        "manifestation": "Leadership roles, creative endeavors, public recognition, vocational honors."
    },
    "Moon": {
        "title": "The Lunar Vessel & Instinctual Soul",
        "archetype": "Somatic memory, emotional rhythms, bodily containment, mothering, and instinctual belonging.",
        "sect_role": "Nocturnal Luminary — Ruler of the night sect; governs the fluctuating ebb and flow of life in matter.",
        "psychological": "Your nervous system's need for safety, nourishment, and emotional grounding. How you digest experiences and care for your vulnerability.",
        "shadow": "Emotional moodiness, regressive dependency, clinging to past grievances, boundary dissolution.",
        "manifestation": "Home life, physical digestion, gut instinct, protective relationships, ancestral heritage."
    },
    "Mercury": {
        "title": "The Psychopomp & Intellectual Bridge",
        "archetype": "Translation, pattern recognition, dialectic inquiry, commerce, and communicative agility.",
        "sect_role": "Common / Convertible — Joins the day sect when rising before the Sun, night sect when setting after.",
        "psychological": "How you categorize reality, process information, verbalize truth, and bridge disparate ideas.",
        "shadow": "Nervous anxiety, intellectual cynicism, deceptive rationalization, cognitive overload.",
        "manifestation": "Writing, speaking, research, negotiation, technical dexterity, commerce."
    },
    "Venus": {
        "title": "The Lesser Benefic & Principle of Harmony",
        "archetype": "Erotic attraction, relational reciprocity, aesthetic elegance, reconciliation, and value.",
        "sect_role": "Nocturnal Benefic — At her most soothing and unifying under the cover of night.",
        "psychological": "How you experience connection, express affection, cultivate self-worth, and appreciate beauty.",
        "shadow": "People-pleasing, avoidance of necessary conflict, vanity, transactional relationships.",
        "manifestation": "Partnerships, romance, artistic creation, social alliances, material pleasures."
    },
    "Mars": {
        "title": "The Lesser Malefic & The Severing Blade",
        "archetype": "Decisive action, boundary defense, courageous separation, passion, and primal drive.",
        "sect_role": "Nocturnal Malefic — Temperamentally dry and hot; balanced and made constructive in night charts.",
        "psychological": "Your ability to assert your will, say an unconditional 'no', fight for your boundaries, and pursue desire.",
        "shadow": "Impulsive aggression, destructive rage, passive-aggressive resentment, burnout.",
        "manifestation": "Athletics, competitive careers, surgery, military/police, technical surgery, defense."
    },
    "Jupiter": {
        "title": "The Greater Benefic & The Principle of Expansion",
        "archetype": "Philosophical wisdom, benevolent providence, ethical elevation, optimism, and abundance.",
        "sect_role": "Diurnal Benefic — Warm and moist; operates as the primary cosmological guardian in day charts.",
        "psychological": "Your capacity for faith, generous vision, ethical integrity, and belief in meaningful serendipity.",
        "shadow": "Dogmatic arrogance, over-promising, excessive indulgence, moral superiority.",
        "manifestation": "Higher education, law, spirituality, publishing, mentorship, institutional honors."
    },
    "Saturn": {
        "title": "The Greater Malefic & The Lord of Time (Chronos)",
        "archetype": "Structural integrity, sobering realism, karmic boundaries, endurance, and elder craftsmanship.",
        "sect_role": "Diurnal Malefic — Cold and dry; warmed and made stabilizing and constructively disciplined in day charts.",
        "psychological": "Your capacity for sustained responsibility, facing cold reality, building lasting mastery, and integrating mortality.",
        "shadow": "Depressive paralysis, severe chronic self-doubt, rigid pessimism, authoritarian control.",
        "manifestation": "Architecture, foundational science, rigorous scholarship, long-term administration, enduring legacy."
    },
    "Uranus": {
        "title": "The Awakener & The Prometheus Principle",
        "archetype": "Radical liberation, lightning insight, systemic disruption, and unconventional truth.",
        "sect_role": "Transpersonal outer planet — Shatters outworn Saturnian structures.",
        "psychological": "Your impulse to break free from societal conditioning and express eccentric authenticity.",
        "shadow": "Compulsive rebellion, alienation, erratic instability, intellectual detachment.",
        "manifestation": "Technological innovation, revolutionary activism, sudden epiphanies."
    },
    "Neptune": {
        "title": "The Mystic Ocean & The Transcendent Veil",
        "archetype": "Universal compassion, spiritual dissolution, imaginal poetry, and oneness.",
        "sect_role": "Transpersonal outer planet — Dissolves rigid boundaries into the divine collective.",
        "psychological": "Your yearning for mystical communion, artistic inspiration, and spiritual surrender.",
        "shadow": "Glamour, delusion, escapist addiction, victim-savior dynamics, lack of discernment.",
        "manifestation": "Visual arts, music, spiritual practice, cinema, healing arts, empathy."
    },
    "Pluto": {
        "title": "The Alchemical Underworld & Radical Metamorphosis",
        "archetype": "Subterranean treasure, psychological shadow excavation, power dynamics, and cathartic rebirth.",
        "sect_role": "Transpersonal outer planet — Renders the obsolete into compost for evolutionary renewal.",
        "psychological": "Where you confront taboos, unconscious survival instincts, obsession, and supreme regeneration.",
        "shadow": "Paranoid control, ruthless manipulation, power struggles, compulsive compulsion.",
        "manifestation": "Depth psychology, crisis management, occult research, transformative wealth."
    },
    "North Node": {
        "title": "The Dragon's Head (Rahu) — Evolutionary Hunger",
        "archetype": "The vortex of incarnational hunger, unfamiliar evolutionary territory, and destined expansion.",
        "sect_role": "Lunar Node — Points where consciousness ingests new experience.",
        "psychological": "The life arena where you feel compelled to break new ground, step out of your comfort zone, and develop new capacities.",
        "shadow": "Insatiable obsession, spiritual greed, material agitation without lasting satisfaction.",
        "manifestation": "Destined turning points, prominent worldly ambitions, rapid skill acquisition."
    },
    "South Node": {
        "title": "The Dragon's Tail (Ketu) — Karmic Release",
        "archetype": "Innate mastery, ancestral familiarity, spiritual purging, and non-attached release.",
        "sect_role": "Lunar Node — Points where consciousness releases and purifies obsolete habits.",
        "psychological": "Gifts that come naturally but can become a stagnant rut if over-relied upon. Calls for conscious detachment.",
        "shadow": "Complacency, fear of stepping into the unknown, escapism into familiar past patterns.",
        "manifestation": "Innate talents, spiritual renunciation, karmic completions."
    },
    "Chiron": {
        "title": "The Wounded Healer & The Bridge of Compassion",
        "archetype": "The primal core wound, systemic outsiderhood, and the transmutation of suffering into medicine.",
        "sect_role": "Centaur asteroid — Orbiting between Saturn (structure) and Uranus (breakthrough).",
        "psychological": "Where you feel an incurable sensitivity or deficiency, which becomes your greatest source of empathic wisdom for others.",
        "shadow": "Chronic victimhood, martyrdom, projecting unhealed wounds onto loved ones.",
        "manifestation": "Holistic therapy, alternative healing, mentoring wounded souls, sacred teaching."
    },
    "Lot of Fortune": {
        "title": "The Hellenistic Lot of Fortune (Pars Fortunae)",
        "archetype": "Physical flourishing, somatic destiny, worldly prosperity, and unexpected turning points.",
        "sect_role": "Calculated from the Ascendant, Sun, and Moon according to diurnal/nocturnal sect.",
        "psychological": "Where body, circumstance, and cosmic providence converge to foster genuine physical flourishing.",
        "shadow": "Chasing superficial wealth or material fortune detached from soul purpose.",
        "manifestation": "Tangible luck, bodily health, financial opportunities, vocational fruition."
    }
}

HOUSE_TOPICS = {
    1: {
        "name": "The Helm (Horoskopos / The Ascendant)",
        "angularity": "Angular (Supreme Power & Action)",
        "nature": "Auspicious, foundational, vital",
        "domains": "Physical embodiment, vital force, personal identity, appearance, the helm of the ship.",
        "psychological": "How you enter the world, your baseline vitality, and the lens through which all experiences are filtered."
    },
    2: {
        "name": "The Gate of Hades (Substance & Resources)",
        "angularity": "Succedent (Support & Accumulation)",
        "nature": "Productive, stabilizing",
        "domains": "Personal possessions, earned income, financial stability, self-reliance, material security.",
        "psychological": "Your relationship to abundance, sense of tangible self-worth, and what sustains your life."
    },
    3: {
        "name": "The Goddess (Siblings, Kin & Local Environment)",
        "angularity": "Cadent (Adaptive & Transitional)",
        "nature": "Mildly auspicious (Joy of the Moon)",
        "domains": "Siblings, neighbors, local travel, everyday communication, early education, sacred rituals.",
        "psychological": "Your immediate cognitive processing, habitual routines, and storytelling within your immediate circle."
    },
    4: {
        "name": "The Subterranean Origin (Imum Coeli / The Roots)",
        "angularity": "Angular (Foundational Power)",
        "nature": "Private, grounding, sacred",
        "domains": "Home, biological ancestry, father/family roots, real estate, the private foundation of the soul.",
        "psychological": "Your private emotional refuge, ancestral inheritances, and the hidden bedrock from which you grow."
    },
    5: {
        "name": "Good Fortune (Creativity, Joy & Offspring)",
        "angularity": "Succedent (Creative Flowering)",
        "nature": "Most auspicious (Joy of Venus)",
        "domains": "Children, artistic self-expression, romance, recreation, speculative enterprises, joyful play.",
        "psychological": "How you celebrate life, create works of personal genius, and allow your inner child to shine."
    },
    6: {
        "name": "Bad Fortune (Labor, Health & Somatic Testing)",
        "angularity": "Cadent (Strenuous & Challenging)",
        "nature": "Strenuous (Joy of Mars)",
        "domains": "Physical illness, daily service, subordinates, repetitive labor, somatic healing crises.",
        "psychological": "Where you confront bodily limitations, the discipline of daily craftsmanship, and unglamorous servitude."
    },
    7: {
        "name": "The Setting Angle (Dysis / The Other)",
        "angularity": "Angular (Relational Power)",
        "nature": "Relational, complementary",
        "domains": "Committed partnerships, marriage, open adversaries, business contracts, one-on-one mirror encounters.",
        "psychological": "How you relate across the threshold of the 'Other', projecting and reclaiming parts of the self through intimate relationship."
    },
    8: {
        "name": "The Idle Place (Epicatafora / Shared Debt & Rebirth)",
        "angularity": "Succedent (Transformative & Heavy)",
        "nature": "Dark, profound, alchemical",
        "domains": "Death, inheritance, partner's assets, taxes, debts, psychological crisis, shared entanglement.",
        "psychological": "Confronting loss, grief, surrender of control, and alchemical resurrection through crisis."
    },
    9: {
        "name": "The God (Higher Learning, Pilgrimage & Philosophy)",
        "angularity": "Cadent (Expansive & Visionary)",
        "nature": "Auspicious (Joy of the Sun)",
        "domains": "Foreign pilgrimage, higher philosophy, spiritual systems, astrology, publishing, long-distance journeys.",
        "psychological": "Your overarching worldview, search for cosmic meaning, and connection to transcendental truth."
    },
    10: {
        "name": "The Midheaven (Praxis / Vocation & Destiny)",
        "angularity": "Angular (Culmination & Prominence)",
        "nature": "Most visible and public",
        "domains": "Career, reputation, public actions, honors, authority, worldly manifestation of destiny.",
        "psychological": "What you build to leave behind in the world; your legacy, public accountability, and vocation."
    },
    11: {
        "name": "The Good Spirit (Agathos Daimon / Allies & Dreams)",
        "angularity": "Succedent (Fulfilling & Supportive)",
        "nature": "Deeply auspicious (Joy of Jupiter)",
        "domains": "Patrons, friends, collective movements, social alliances, realization of cherished hopes.",
        "psychological": "Your ability to receive support from community, align with visionary groups, and manifest communal dreams."
    },
    12: {
        "name": "The Bad Spirit (Kakos Daimon / Solitude & The Unconscious)",
        "angularity": "Cadent (Hidden & Dissolving)",
        "nature": "Challenging (Joy of Saturn)",
        "domains": "Isolation, mental confinement, self-undoing, unseen enemies, institutions, spiritual retreat.",
        "psychological": "The collective unconscious, hidden psychological blind spots, karmic debts, and mystical transcendence through surrender."
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. PLANET IN HOUSE CLASSICAL DELINEATIONS (THE 168 COMBINATIONS)
# ─────────────────────────────────────────────────────────────────────────────

def get_planet_in_house_delineation(planet: str, house: int, sign: str = "", dignity: str = "") -> str:
    """Generate exhaustive, scholarly Hellenistic delineation for any planet in any house."""
    planet_clean = planet.title()
    house_num = int(house)
    house_info = HOUSE_TOPICS.get(house_num, HOUSE_TOPICS[1])
    planet_info = PLANET_ARCHETYPES.get(planet_clean, PLANET_ARCHETYPES["Saturn"])

    delineations = {
        # SATURN
        ("Saturn", 1): (
            "With **Saturn positioned in the 1st House (The Helm / Ascendant)**, the native embodies the Greater Chronocrator directly upon the vehicle of self. "
            "In Hellenistic doctrine, this is an angular placement of severe gravitas. From early life, you are entrusted with heavy adult responsibilities, often fostering "
            "an aura of solemn maturity, cautious deliberation, and sharp psychological boundaries. Your physical constitution requires steady discipline, proper posture, and bone-deep endurance.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "The initial phase of life often feels marked by a pervasive sense of inadequacy or a burden of solitude, as if you must prove your right to occupy space. "
            "However, as Demetra George emphasizes in *Astrology and the Authentic Self*, Saturn in House 1 is the signature of the 'Master Craftsman.' "
            "After your first Saturn Return (around age 29–30), the self-doubt crystallizes into rock-solid self-respect, quiet authority, and enduring resilience that others lean on during crises."
        ),
        ("Saturn", 2): (
            "With **Saturn in the 2nd House (The Gate of Hades / Substance)**, the great principle of conservation and scarcity anchors into earned wealth and personal resources. "
            "In traditional astrology, this placement indicates that financial prosperity rarely arrives through sudden luck or unearned gifts; rather, wealth is accumulated through methodical prudence, "
            "shrewd budgeting, and hard-won material endurance.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "You may grapple with an underlying somatic anxiety regarding poverty or financial instability, regardless of how much you possess. "
            "The authentic evolutionary lesson is shifting from a fear of lack into unshakeable self-reliance, realizing that your true capital is your competence and self-mastery."
        ),
        ("Saturn", 3): (
            "With **Saturn in the 3rd House (The Goddess / Cognition & Kin)**, Saturn brings methodical concentration to speech, writing, early education, and sibling relationships. "
            "The mind does not rush toward superficial opinions; it weighs every word, favoring rigorous logic, technical exactitude, and classical scholarship over idle banter.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "Early schooling or sibling dynamics may have felt demanding or emotionally aloof. You may have felt misunderstood or criticized for your ideas. "
            "In adulthood, this placement produces outstanding researchers, technical writers, editors, and scholars whose spoken word carries profound weight."
        ),
        ("Saturn", 4): (
            "With **Saturn in the 4th House (The Imum Coeli / Subterranean Origin)**, Saturn anchors into the sacred subterranean roots of the chart—the home, ancestry, and biological parents. "
            "This is a powerful angular stationing. Early domestic life was likely marked by heavy expectations, emotional coolness, austerity, or the presence of a strict parental figure.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "You carry a deep generational weight and a longing for authentic belonging. As Demetra George writes, when Saturn sits at the roots of the chart, the native must "
            "become their own wise parent. Real estate, property ownership, land preservation, and building a secure home sanctuary become major keystones of your mature identity."
        ),
        ("Saturn", 5): (
            "With **Saturn in the 5th House (Good Fortune / Creative Self-Expression)**, the Greater Malefic occupies the house of joyful play, children, and creative fertility. "
            "This placement demands that creative self-expression not be treated frivolously; your art, romances, and creative passions require structural rigor, formal technique, and sustained commitment.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "You may have experienced a block around spontaneous play or felt that romantic joy required painful emotional compromise. "
            "Yet, when you approach creativity as a disciplined craft—producing literature, formal design, or lasting works of art—Saturn yields monumental creative masterpieces."
        ),
        ("Saturn", 6): (
            "With **Saturn in the 6th House (Bad Fortune / Daily Labor & Health)**, Saturn operates in the house of physical service and somatic endurance. "
            "Here Saturn's dry, cold qualities require mindful attention to joints, skeletal alignment, teeth, and chronic digestive fatigue under stress. "
            "In daily employment, you are an indefatigable worker who quietly shoulders complex technical burdens that others abandon.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "You must guard against chronic workaholism and treating your body as an unfeeling machine. Incorporating structured physical recovery into your routine transforms this placement into remarkable health longevity."
        ),
        ("Saturn", 7): (
            "With **Saturn in the 7th House (The Setting Angle / Committed Partnerships)**, the Lord of Karma directly faces the Ascendant across the threshold of partnership. "
            "In Hellenistic astrology, this often signifies late marriage or long-lasting bonds with partners who are older, highly disciplined, serious, or carry significant life burdens.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "Early intimate relationships frequently bring painful lessons regarding boundaries, rejection, or emotional coldness. "
            "Once you stop projecting your own need for maturity onto external partners, your relationships become ironclad alliances rooted in mutual loyalty and rock-solid commitment."
        ),
        ("Saturn", 8): (
            "With **Saturn in the 8th House (The Idle Place / Shared Resources & Transformation)**, Saturn sits in the house of crisis, death, partner's wealth, and psychological entanglement. "
            "There may be delays or legal complexities surrounding inheritances, joint mortgages, or taxes, demanding scrupulous ethical transparency.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "You possess an extraordinary capacity to look into the psychological abyss without flinching. You are uniquely equipped to handle depth psychology, crisis management, "
            "and alchemical grief, guiding others through the darkest passages of their lives."
        ),
        ("Saturn", 9): (
            "With **Saturn in the 9th House (The God / Higher Philosophy & Pilgrimage)**, Saturn applies his rigorous lens to spirituality, higher learning, and worldviews. "
            "You are skeptical of superficial dogmas or 'feel-good' new age spiritualities; you require philosophy to stand the test of historical evidence and lived trial.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "You make an exceptional philosopher, jurist, professor, or theological scholar. Foreign travel often involves serious study, professional duty, or historical pilgrimages."
        ),
        ("Saturn", 10): (
            "With **Saturn in the 10th House (The Midheaven / Vocation & Public Standing)**, Saturn culminates at the highest point of the sky. "
            "In ancient astrology, this is one of the most prominent signatures of professional elevation achieved through immense personal labor. "
            "You are destined for positions of high administrative responsibility, institutional leadership, and public accountability.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "Success comes later in life, after thorough testing. As Ptolemy and Valens note, Saturn at the MC demands unimpeachable integrity; if built on deception, the fall is steep, but if built on true craftsmanship, your reputation endures across generations."
        ),
        ("Saturn", 11): (
            "With **Saturn in the 11th House (The Good Spirit / Alliances & Aims)**, Saturn occupies his planetary joy. "
            "Here, Saturn filters social acquaintances, preferring a handful of lifelong, loyal comrades over large crowds of superficial friends. "
            "Your long-term goals require decades of patience, but they manifest with immense structural permanence.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "You frequently find alliance with elder mentors, professional guilds, or institutions working for societal stabilization and enduring reforms."
        ),
        ("Saturn", 12): (
            "With **Saturn in the 12th House (The Bad Spirit / Solitude & The Unconscious)**, Saturn sits in his ancient Hellenistic Joy. "
            "Saturn rejoices in the 12th house because cold solitude and contemplative isolation allow him to strip away sensory distractions. "
            "This placement grants profound spiritual stamina, the ability to work in seclusion, and deep protection against unseen psychic intrusion.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "You must consciously work through unconscious fears of abandonment or guilt. Meditation, time spent in natural retreats, and behind-the-scenes work unlock sublime mystical tranquility."
        ),

        # JUPITER
        ("Jupiter", 1): (
            "With **Jupiter in the 1st House (The Helm / Ascendant)**, the Greater Benefic blesses the core vehicle of your incarnation. "
            "In Hellenistic astrology, Jupiter on the Ascendant is a magnificent signature of natural benevolence, physical vitality, philosophical optimism, and moral charisma. "
            "People instinctively trust your presence, sense of fairness, and overarching wisdom.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "You navigate life with an inherent faith that providence will provide the right door when another closes. "
            "The developmental challenge is avoiding complacency, overindulgence, or overextending yourself with grand promises."
        ),
        ("Jupiter", 2): (
            "With **Jupiter in the 2nd House (Substance & Resources)**, the principle of divine abundance expands personal income and material assets. "
            "You have a natural ability to attract wealth through teaching, international commerce, ethical enterprise, and advisory roles.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "Financial generosity flows naturally, though you must beware of careless over-spending during prosperous cycles. True wealth for you is tied to using your resources to elevate others."
        ),
        ("Jupiter", 7): (
            "With **Jupiter in the 7th House (The Other / Partnerships)**, the Greater Benefic elevates committed relationships. "
            "Your significant other is often a person of broad vision, foreign background, philosophical depth, or generous social standing.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "Partnership is an expansive vehicle for your spiritual growth. You thrive in alliances where mutual freedom, intellectual respect, and shared ethics form the bedrock of the bond."
        ),
        ("Jupiter", 10): (
            "With **Jupiter in the 10th House (Midheaven / Praxis & Career)**, Jupiter culminates with supreme honor at the peak of the chart. "
            "In classical texts, this indicates public esteem, vocational elevation, and success in jurisprudence, higher education, publishing, and moral leadership.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "Your professional life is guided by high ethical principles. You are called to act as a benevolent guide, patron, or mentor who leaves an uplifting stamp upon society."
        ),

        # SUN
        ("Sun", 1): (
            "With the **Sun in the 1st House (The Helm / Ascendant)**, the sovereign luminary rises upon your incarnational horizon. "
            "This bestows radiant presence, high vitality, unmistakable personal magnetism, and an undeniable drive to live life on your own terms. "
            "You cannot hide behind others; your life requires bold authenticity, creative leadership, and visible self-expression."
        ),
        ("Sun", 10): (
            "With the **Sun in the 10th House (Midheaven / Vocation)**, the Solar King reaches his midday zenith. "
            "In Hellenistic doctrine, this is an archetypal signature of vocational prominence, public authority, and undeniable career visibility. "
            "You are born to take the helm of projects, command respect, and shine your creative radiance in the public sphere."
        ),

        # MOON
        ("Moon", 1): (
            "With the **Moon in the 1st House (The Helm / Ascendant)**, the Lunar Luminary shapes the physical vessel and psychological lens. "
            "You possess an intuitive, receptive constitution that instantly registers the emotional climate of any room. "
            "Your feelings, moods, and somatic needs are transparently readable upon your countenance, making you deeply empathetic and approachable."
        ),
        ("Moon", 4): (
            "With the **Moon in the 4th House (The Imum Coeli / Roots & Ancestry)**, the Moon anchors into her most sacred home territory. "
            "Your psychological grounding is inextricably linked to your ancestral roots, home sanctuary, and maternal lineage. "
            "You possess a fierce instinct to protect, shelter, and preserve private domestic sanctuary."
        ),

        # MARS
        ("Mars", 1): (
            "With **Mars in the 1st House (The Helm / Ascendant)**, the Warrior God fuels your physical vehicle with volcanic drive, rapid reflexes, and fearless initiative. "
            "In Hellenistic astrology, this angular placement grants exceptional competitive stamina, bold physical courage, and a sharp, direct communication style.\n\n"
            "**Psychological & Developmental Arc:**\n"
            "You are challenged to master impulsive anger or irritability, channeling this fiery vitality into decisive pioneering actions, athletic discipline, or courageous advocacy."
        ),
        ("Mars", 10): (
            "With **Mars in the 10th House (Midheaven / Vocation)**, Mars operates at the summit of your public ambition. "
            "You approach your career as a strategic campaign, driving toward goals with relentless determination, executive decisiveness, and technical precision. "
            "You thrive in high-stakes environments where rapid, courageous decisions are required."
        ),

        # VENUS
        ("Venus", 1): (
            "With **Venus in the 1st House (The Helm / Ascendant)**, the Lesser Benefic graces your persona with artistic charm, relational grace, and aesthetic refinement. "
            "You naturally foster harmony, disarm tension with warmth, and possess an instinctive eye for elegance, proportion, and visual beauty."
        ),
        ("Venus", 7): (
            "With **Venus in the 7th House (The Other / Marriage & Partnership)**, Venus occupies her natural home of committed union. "
            "You view partnership as an art form, thriving when bonded with someone who matches your aesthetic taste, romantic tenderness, and desire for deep reciprocal devotion."
        ),

        # MERCURY
        ("Mercury", 1): (
            "With **Mercury in the 1st House (The Helm / Ascendant)**, the Messenger God quickens the intellect and speech right at the physical interface. "
            "Your mind operates at lightning speed—observant, curious, articulate, and perpetually analyzing patterns. You are a natural translator, writer, and conversationalist."
        ),
        ("Mercury", 10): (
            "With **Mercury in the 10th House (Midheaven / Career)**, your professional vocation is driven by writing, teaching, communication, commerce, and information architecture. "
            "You are recognized for intellectual versatility, strategic articulation, and communicative authority."
        ),

        # LUNAR NODES
        ("North Node", 1): (
            "With the **North Node (Rahu) in the 1st House and South Node in the 7th House**, your evolutionary trajectory calls you to claim radical personal sovereignty. "
            "While in past cycles you may have over-accommodated partners and dissolved into the 'Other', this lifetime demands that you define your own path, speak your unfiltered truth, and embody the heroic self."
        ),
        ("North Node", 10): (
            "With the **North Node in the 10th House and South Node in the 4th House**, your evolutionary growth propels you out of comfortable domestic seclusion into public responsibility and career achievement. "
            "You are called to step into public leadership and leave a visible mark on the wider collective."
        ),

        # LOT OF FORTUNE
        ("Lot of Fortune", 1): (
            "With the **Lot of Fortune in the 1st House (The Ascendant)**, the ancient Hellenistic condition of 'Fortune at the Helm' occurs. "
            "Body, physical destiny, and cosmic providence are united. The native's worldly fortune and opportunities arise directly from their own physical agency, personal initiative, and authentic individuality."
        ),
        ("Lot of Fortune", 10): (
            "With the **Lot of Fortune in the 10th House (The Midheaven)**, classical astrology identifies this as an exceptional marker of worldly success, vocational prominence, and material rewards through public actions."
        )
    }

    # Direct match in exhaustive table
    if (planet_clean, house_num) in delineations:
        return delineations[(planet_clean, house_num)]

    # Dynamic Hellenistic Synthesis for all other combinations
    return (
        f"With **{planet_clean} stationed in the {house_num}{_get_ordinal_suffix(house_num)} House ({house_info['name']})**, "
        f"the archetypal principle of {planet_clean} ({planet_info['archetype'].lower()}) manifests directly within the sphere of {house_info['domains'].lower()}.\n\n"
        f"**Angularity & Effectiveness:**\n"
        f"The {house_num}{_get_ordinal_suffix(house_num)} House is an **{house_info['angularity']}**. In Demetra George's Hellenistic methodology, "
        f"angularity indicates how effectively the planet can focus its light and conduct the active business of your life. "
        f"Here, {planet_clean} works through the matters of {house_info['psychological'].lower()}\n\n"
        f"**Psychological & Developmental Synthesis:**\n"
        f"- **Core Drive:** {planet_info['psychological']}\n"
        f"- **Shadow Trap to Integrate:** {planet_info['shadow']}\n"
        f"- **Actionable Wisdom:** Align {planet_clean}'s expression with the authentic affairs of this house to cultivate lasting psychological mastery and material fulfillment."
    )


def _get_ordinal_suffix(n: int) -> str:
    if 11 <= (n % 100) <= 13:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


# ─────────────────────────────────────────────────────────────────────────────
# 3. QUERY ANALYZER & INTENT EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def parse_astrological_query(query: str) -> Dict[str, Any]:
    """
    Carefully inspects the user's natural language question to extract:
    - Queried planets (e.g. Saturn, Mars, Sun, Moon)
    - Queried houses (e.g. House 1, 10th house, 7th house)
    - Queried life domains (e.g. career, love, money, health, purpose)
    - Aspects queried (square, trine, opposition, conjunction)
    - Contextual query type
    """
    q = query.lower()
    
    planets_found = []
    houses_found = []
    domains_found = []
    aspects_found = []

    # Detect planets
    planet_map = {
        "sun": "Sun", "moon": "Moon", "mercury": "Mercury", "venus": "Venus",
        "mars": "Mars", "jupiter": "Jupiter", "saturn": "Saturn",
        "uranus": "Uranus", "neptune": "Neptune", "pluto": "Pluto",
        "north node": "North Node", "south node": "South Node",
        "rahu": "North Node", "ketu": "South Node",
        "chiron": "Chiron", "lot of fortune": "Lot of Fortune", "part of fortune": "Lot of Fortune"
    }
    for trigger, p_name in planet_map.items():
        if re.search(r'\b' + re.escape(trigger) + r'\b', q):
            if p_name not in planets_found:
                planets_found.append(p_name)

    # Detect houses explicitly (e.g. "house 1", "1st house", "tenth house")
    num_map = {
        "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6,
        "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10, "eleventh": 11, "twelfth": 12
    }
    for word, h_num in num_map.items():
        if re.search(r'\b' + word + r'\s+house\b', q):
            if h_num not in houses_found:
                houses_found.append(h_num)

    digit_houses = re.findall(r'\b(?:house\s+(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)?\s+house)\b', q)
    for m in digit_houses:
        val = int(m[0] or m[1])
        if 1 <= val <= 12 and val not in houses_found:
            houses_found.append(val)

    # Detect life domains
    if re.search(r'\b(career|job|vocation|profession|calling|boss|reputation|work|destiny)\b', q):
        domains_found.append("career")
    if re.search(r'\b(love|relationship|relationships|marriage|partner|spouse|dating|romance)\b', q):
        domains_found.append("love")
    if re.search(r'\b(money|wealth|income|finances|assets|rich|fortune)\b', q):
        domains_found.append("wealth")
    if re.search(r'\b(health|illness|vitality|body|diet|disease)\b', q):
        domains_found.append("health")
    if re.search(r'\b(purpose|soul|dharma|evolution|spiritual|meaning)\b', q):
        domains_found.append("purpose")
    if re.search(r'\b(shadow|depression|fear|wound|karma|trauma)\b', q):
        domains_found.append("shadow")

    # Detect aspects
    aspect_triggers = ["conjunction", "conjunct", "sextile", "square", "trine", "opposition", "oppose"]
    for asp in aspect_triggers:
        if asp in q:
            aspects_found.append(asp.replace("conjunct", "conjunction").replace("oppose", "opposition"))

    return {
        "raw_query": query,
        "planets": planets_found,
        "houses": houses_found,
        "domains": domains_found,
        "aspects": aspects_found
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. MASTER DELINEATION GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

class ClassicalDelineator:
    """
    Standalone Astrological Reasoning Engine.
    Executes in-depth, authentic Hellenistic syntheses without external APIs.
    """

    def __init__(self, chart: Optional[Any] = None, rag_retriever=None):
        self.chart = chart
        self.rag = rag_retriever

    def delineate(self, query: str) -> str:
        """Main entry point to produce an exhaustive, tailored response."""
        parsed = parse_astrological_query(query)
        planets = parsed["planets"]
        houses = parsed["houses"]
        domains = parsed["domains"]
        aspects = parsed["aspects"]

        # 1. Check if user asked about a specific Planet in a specific House
        if planets and houses:
            return self._delineate_planet_in_house(planets[0], houses[0], query)

        # 2. Check if user asked about a Planet
        if planets:
            return self._delineate_planet_query(planets, query)

        # 3. Check if user asked about a House
        if houses:
            return self._delineate_house_query(houses[0], query)

        # 4. Check if user asked about a Life Domain (career, love, money, purpose)
        if domains:
            return self._delineate_domain_query(domains[0], query)

        # 5. Check if user asked about Sect / Planetary Allies
        if "sect" in query.lower() or "benefic" in query.lower() or "malefic" in query.lower():
            return self._delineate_sect_query()

        # 6. Check if user asked about Lord of the Chart / Ascendant Ruler
        if "lord" in query.lower() or "ascendant ruler" in query.lower() or "ruler of the chart" in query.lower():
            return self._delineate_lord_query()

        # 7. General Comprehensive Reading
        return self._delineate_general_query(query)

    def _delineate_planet_in_house(self, planet: str, house: int, query: str) -> str:
        """Delineates a specific planet in a specific house (e.g. Saturn in House 1)."""
        reading = get_planet_in_house_delineation(planet, house)
        house_info = HOUSE_TOPICS.get(house, HOUSE_TOPICS[1])
        planet_info = PLANET_ARCHETYPES.get(planet, PLANET_ARCHETYPES["Saturn"])

        out = []
        out.append(f"## Classical Delineation: **{planet} in the {house}{_get_ordinal_suffix(house)} House**")
        out.append(f"*{house_info['name']} · {house_info['angularity']}*\n")
        out.append(reading)

        # Check if the user has a calculated chart, and compare their natal position!
        if self.chart:
            natal_p = self._get_natal_planet(planet)
            if natal_p:
                n_sign = natal_p.get("sign", "")
                n_deg = natal_p.get("sign_degree", 0)
                n_min = natal_p.get("sign_minute", 0)
                n_house = natal_p.get("house", 0)
                n_dignity = natal_p.get("dignity", "peregrine")
                n_retro = " (Retrograde ℞)" if natal_p.get("retrograde") else ""

                out.append("\n---\n### Your Personal Chart Reality:")
                if n_house == house:
                    out.append(
                        f"✦ **Exact Match:** You have **{planet}** placed directly in your **{house}{_get_ordinal_suffix(house)} House** at **{n_deg}°{n_min:02d}' {n_sign}** "
                        f"with **{n_dignity.upper()}** dignity{n_retro}. This makes the archetypal reading above directly operative as a primary pillar of your incarnation."
                    )
                else:
                    out.append(
                        f"✦ In your calculated natal chart, **{planet}** is stationed in **House {n_house}** ({n_sign} {n_deg}°{n_min:02d}'{n_retro}, {n_dignity.upper()}). "
                        f"While the general archetype of {planet} in House {house} is detailed above, your personal life energy for {planet} primarily manifests through **House {n_house} ({HOUSE_TOPICS.get(n_house, {}).get('name', '')})**."
                    )
        else:
            out.append(
                "\n> *Observatory Note: Calculate your natal chart above to see which sign, degree, and house your natal {planet} actually occupies.*".format(planet=planet)
            )

        # Add targeted Demetra George citation if available
        self._append_rag_insight(out, f"{planet} house {house}")
        return "\n\n".join(out)

    def _delineate_planet_query(self, planets: List[str], query: str) -> str:
        """Delineates an inquiry focused on one or more planets."""
        out = []
        for p_name in planets[:2]:
            p_info = PLANET_ARCHETYPES.get(p_name, PLANET_ARCHETYPES["Sun"])
            out.append(f"## {p_name} — {p_info['title']}\n")
            out.append(f"**Archetypal Essence:** {p_info['archetype']}")
            out.append(f"**Hellenistic Sect Nature:** {p_info['sect_role']}\n")
            out.append(f"### Psychological Integration (Demetra George Lineage)\n{p_info['psychological']}\n")
            out.append(f"**Shadow Trap & Developmental Work:**\n{p_info['shadow']}\n")

            if self.chart:
                natal_p = self._get_natal_planet(p_name)
                if natal_p:
                    n_sign = natal_p.get("sign", "")
                    n_deg = natal_p.get("sign_degree", 0)
                    n_min = natal_p.get("sign_minute", 0)
                    n_house = natal_p.get("house", 1)
                    n_dignity = natal_p.get("dignity", "peregrine")
                    n_retro = " *(in Retrograde motion)*" if natal_p.get("retrograde") else ""

                    out.append(f"### In Your Natal Chart:\n"
                               f"- **Position:** **{n_deg}°{n_min:02d}' {n_sign}** in **House {n_house}** ({HOUSE_TOPICS.get(n_house, {}).get('name', '')}){n_retro}\n"
                               f"- **Essential Dignity:** **{n_dignity.upper()}**\n\n"
                               + get_planet_in_house_delineation(p_name, n_house, n_sign, n_dignity))

        self._append_rag_insight(out, " ".join(planets))
        return "\n\n".join(out)

    def _delineate_house_query(self, house: int, query: str) -> str:
        """Delineates an inquiry into a specific house."""
        h_info = HOUSE_TOPICS.get(house, HOUSE_TOPICS[1])
        out = []
        out.append(f"## The {house}{_get_ordinal_suffix(house)} House: {h_info['name']}")
        out.append(f"- **Angularity:** {h_info['angularity']}")
        out.append(f"- **Classical Nature:** {h_info['nature']}")
        out.append(f"- **Core Life Arenas:** {h_info['domains']}\n")
        out.append(f"### Hellenistic Understanding\n{h_info['psychological']}\n")

        if self.chart:
            # Find planets in this house
            planets_in_house = []
            if hasattr(self.chart, "planets") and self.chart.planets:
                for p in self.chart.planets:
                    p_dict = p if isinstance(p, dict) else (p.dict() if hasattr(p, "dict") else p.__dict__)
                    if p_dict.get("house") == house:
                        planets_in_house.append(f"**{p_dict.get('name')}** at {p_dict.get('sign_degree', 0)}° {p_dict.get('sign')} ({p_dict.get('dignity', 'peregrine').upper()})")

            # Find house cusp ruler
            cusp_ruler = "Unknown"
            cusp_sign = "Unknown"
            if hasattr(self.chart, "houses") and self.chart.houses:
                for h in self.chart.houses:
                    h_dict = h if isinstance(h, dict) else (h.dict() if hasattr(h, "dict") else h.__dict__)
                    if h_dict.get("house_number") == house or h_dict.get("house") == house:
                        cusp_ruler = h_dict.get("ruler", "Unknown")
                        cusp_sign = h_dict.get("sign", "Unknown")
                        break

            out.append("### In Your Personal Chart:")
            out.append(f"- **Cusp Sign:** {cusp_sign}")
            out.append(f"- **Planetary Lord (Ruler):** **{cusp_ruler}**")
            if planets_in_house:
                out.append(f"- **Occupants Stationed Here:** {', '.join(planets_in_house)}")
            else:
                out.append(f"- **Occupants:** No natal planets directly occupy this house; its business is steered by its ruler, **{cusp_ruler}**.")

        self._append_rag_insight(out, f"house {house}")
        return "\n\n".join(out)

    def _delineate_domain_query(self, domain: str, query: str) -> str:
        """Delineates a major life inquiry (career, love, wealth, purpose)."""
        domain_configs = {
            "career": {
                "title": "Vocational Dharma & Public Life (10th House & Midheaven)",
                "key_house": 10,
                "key_planets": ["Sun", "Mars", "Saturn", "Mercury"],
                "intro": (
                    "In Hellenistic astrology, career and vocation (Praxis) are determined not merely by ambition, but by the cosmic signature "
                    "of the Midheaven (MC), the 10th House, and the planets that aspect the Sun and Ascendant. "
                    "Demetra George emphasizes that authentic vocation represents the tangible worldly work that anchors your soul purpose into society."
                )
            },
            "love": {
                "title": "Sacred Partnership & Relational Destiny (7th House & Venus)",
                "key_house": 7,
                "key_planets": ["Venus", "Mars", "Moon"],
                "intro": (
                    "Relational compatibility and committed union in traditional astrology are anchored at the 7th House (The Setting Angle / Dysis). "
                    "The condition of your 7th House cusp ruler and Venus reveals how you experience intimacy, what you project onto partners, "
                    "and the contractual agreements that foster lasting harmony."
                )
            },
            "wealth": {
                "title": "Financial Sustenance & Material Prosperity (2nd House & Lot of Fortune)",
                "key_house": 2,
                "key_planets": ["Jupiter", "Venus", "Saturn", "Lot of Fortune"],
                "intro": (
                    "Material prosperity in classical tradition is divided between earned income (House 2: The Gate of Hades), "
                    "providential luck (The Lot of Fortune), and the condition of the Greater Benefic (Jupiter). "
                    "Wealth flourishes when your earning aligns with your natural essential dignities."
                )
            },
            "purpose": {
                "title": "Evolutionary Soul Purpose & The Lunar Nodes Axis",
                "key_house": 1,
                "key_planets": ["North Node", "South Node", "Sun", "Moon"],
                "intro": (
                    "Your core incarnational purpose is woven through the triad of the Ascendant (physical vehicle), "
                    "the Sun (conscious sovereign will), the Moon (somatic emotional ground), and the Lunar Nodes (destined evolutionary hunger)."
                )
            }
        }

        cfg = domain_configs.get(domain, domain_configs["purpose"])
        out = [f"## {cfg['title']}\n", cfg['intro']]

        if self.chart:
            out.append("\n### Your Chart's Specific Indicators:")
            for p_name in cfg["key_planets"]:
                natal_p = self._get_natal_planet(p_name)
                if natal_p:
                    n_sign = natal_p.get("sign", "")
                    n_deg = natal_p.get("sign_degree", 0)
                    n_house = natal_p.get("house", 0)
                    n_dignity = natal_p.get("dignity", "peregrine")
                    out.append(f"- **{p_name}**: Stationed in **{n_sign}** ({n_deg}°) in **House {n_house}** ({n_dignity.upper()})")

        self._append_rag_insight(out, domain)
        return "\n\n".join(out)

    def _delineate_sect_query(self) -> str:
        """Delineates Hellenistic Sect status."""
        sect = getattr(self.chart, "sect", "Diurnal") if self.chart else "Diurnal"
        benefic = getattr(self.chart, "benefic_of_sect", "Jupiter") if self.chart else "Jupiter"
        malefic = getattr(self.chart, "malefic_of_sect", "Saturn") if self.chart else "Saturn"

        out = [
            f"## Hellenistic Sect: **{sect}**\n",
            "In Hellenistic astrology, **Sect (Hairesis)** is the primary division of cosmic team alignment: "
            "it determines whether your incarnation was born under the solar rule of the Day (Diurnal) or the lunar mantle of the Night (Nocturnal).\n",
            f"### Your Planetary Team:\n"
            f"- **Primary In-Sect Benefic (Cosmic Ally):** **{benefic}** — Your source of natural grace, effortless expansion, and moral fortitude.\n"
            f"- **Contrary-to-Sect Malefic (Crucible of Initiation):** **{malefic}** — Represents your greatest developmental challenge, requiring conscious craftsmanship and maturity.\n"
        ]
        return "\n\n".join(out)

    def _delineate_lord_query(self) -> str:
        """Delineates the Lord of the Chart / Ascendant Ruler."""
        ruler = getattr(self.chart, "ascendant_ruler", "Sun") if self.chart else "Sun"
        out = [
            f"## Lord of the Chart (The Ascendant Ruler): **{ruler}**\n",
            "In traditional astrology, the ruler of your Ascendant is designated as the **'Captain of the Ship'** (*Oikodespotes*). "
            "While other planets govern specific areas of experience, the Lord of the Chart steers your entire incarnation, embodying your life's primary trajectory.\n"
        ]
        if self.chart:
            natal_p = self._get_natal_planet(ruler)
            if natal_p:
                n_sign = natal_p.get("sign", "")
                n_deg = natal_p.get("sign_degree", 0)
                n_house = natal_p.get("house", 1)
                n_dignity = natal_p.get("dignity", "peregrine")
                out.append(
                    f"### Location of the Helmsman:\n"
                    f"Your Lord **{ruler}** is anchored in **{n_sign} at {n_deg}°** within **House {n_house} ({HOUSE_TOPICS.get(n_house, {}).get('name', '')})** with **{n_dignity.upper()}** dignity. "
                    f"This indicates that your evolutionary purpose and primary life focus unfold through matters of {HOUSE_TOPICS.get(n_house, {}).get('domains', '')}."
                )
        return "\n\n".join(out)

    def _delineate_general_query(self, query: str) -> str:
        """General inquiry handler synthesizing the question directly."""
        out = [
            f"## Hellenistic Astrological Inquiry: *\"{query.strip()}\"*",
            "Classical astrology approaches every inquiry through the lens of objective celestial geometry, essential dignity, and the integration of the Authentic Self."
        ]
        if self.chart:
            asc = getattr(self.chart, "ascendant", {})
            sect = getattr(self.chart, "sect", "Diurnal")
            ruler = getattr(self.chart, "ascendant_ruler", "Sun")
            out.append(
                f"\n**Your Natal Bedrock:**\n"
                f"- **Ascendant:** {asc.get('sign', '') if isinstance(asc, dict) else getattr(asc, 'sign', '')} ({sect} Sect)\n"
                f"- **Lord of Chart:** {ruler}\n"
                f"- **Sect Benefic:** {getattr(self.chart, 'benefic_of_sect', 'Jupiter')}\n"
                f"- **Sect Malefic:** {getattr(self.chart, 'malefic_of_sect', 'Saturn')}"
            )

        self._append_rag_insight(out, query)
        return "\n\n".join(out)

    # ─────────────────────────────────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────────────────────────────────

    def _get_natal_planet(self, name: str) -> Optional[Dict[str, Any]]:
        if not self.chart or not hasattr(self.chart, "planets"):
            return None
        for p in self.chart.planets:
            p_dict = p if isinstance(p, dict) else (p.dict() if hasattr(p, "dict") else p.__dict__)
            if p_dict.get("name", "").lower() == name.lower():
                return p_dict
        return None

    def _append_rag_insight(self, out: List[str], query_term: str):
        """Retrieve relevant Demetra George textbook passage and weave it in naturally."""
        if not self.rag:
            return
        try:
            results = self.rag.retrieve(query_term, top_k=2)
            if results:
                out.append("\n### Authoritative Demetra George Classical Literature:")
                for r in results[:2]:
                    chunk = r.get("chunk", {})
                    source = chunk.get("source", "Demetra George")
                    ch = chunk.get("chapter", "Ancient Astrology")
                    pg = chunk.get("page", "")
                    txt = chunk.get("text", "")
                    clean_txt = re.sub(r'\s+', ' ', txt).strip()[:260]
                    out.append(f"> \"{clean_txt}...\"\n> — **{source}** ({ch}, p. {pg})")
        except Exception:
            pass
