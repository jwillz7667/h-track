import { addDays, subDays } from "date-fns";

export interface CountryCaseData {
  country: string;
  code: string;
  totalCases: number;
  activeCases: number;
  deaths: number;
  trend: 'up' | 'down' | 'flat';
  history: { date: string; cases: number }[];
}

export interface NewsUpdate {
  id: string;
  timestamp: Date;
  country: string;
  message: string;
  isBreaking: boolean;
}

export const newsTemplates = [
  "New suspected cluster identified in rural {country}.",
  "Ministry of Health in {country} issues Level 2 alert.",
  "Rapid testing deployed to remote regions of {country}.",
  "{country} CDC investigating potential zoonotic spillover event.",
  "Public health warning: increased rodent activity reported near {country} border.",
  "Local hospitals in {country} on high alert following admission of {cases} patients with respiratory distress.",
  "Contact trace underway in {country} for newly reported HPS cases.",
  "Scientists in {country} sequence active viral strain.",
  "Travel advisory updated for specific provinces within {country}.",
  "Emergency funding allocated for diagnostic kits in {country}.",
  "Health officials in {country} begin public awareness campaigns.",
  "Livestock and agriculture workers in {country} advised to use PPE."
];

export const breakingTemplates = [
  "Suddenly {cases} new severe cases confirmed in {country}.",
  "Fatality reported in {country} related to recent outbreak.",
  "{country} declares regional state of emergency due to viral clusters.",
  "Major containment zone actively established in {country}.",
  "ICU capacity stretched in {country} outbreak epicenter.",
  "New variant concerns dismissed by {country} health officials after latest cluster."
];

export const getRandomNews = (countryName: string, countryCode: string, isBreaking: boolean, recentCases?: number) => {
  const templates = isBreaking ? breakingTemplates : newsTemplates;
  const template = templates[Math.floor(Math.random() * templates.length)];
  const message = template.replace('{country}', countryName).replace('{cases}', recentCases?.toString() || (Math.floor(Math.random() * 5) + 1).toString());
  return {
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date(),
    country: countryCode,
    message,
    isBreaking
  };
};

// Generate some historical data for a country
const generateHistory = (baseCases: number, days: number) => {
  const history = [];
  let currentCases = Math.floor(baseCases * 0.5);
  for (let i = days; i >= 0; i--) {
    const date = subDays(new Date(), i).toISOString().split('T')[0];
    // Add some random noise
    currentCases += Math.floor(Math.random() * 5);
    history.push({ date, cases: currentCases });
  }
  return history;
};

// ... rest of the file ...

export const initialCountries: CountryCaseData[] = [
  { country: "Argentina", code: "ARG", totalCases: 215, activeCases: 42, deaths: 31, trend: 'up', history: generateHistory(180, 30) },
  { country: "United States", code: "USA", totalCases: 198, activeCases: 15, deaths: 22, trend: 'flat', history: generateHistory(170, 30) },
  { country: "Chile", code: "CHL", totalCases: 145, activeCases: 25, deaths: 18, trend: 'up', history: generateHistory(110, 30) },
  { country: "Brazil", code: "BRA", totalCases: 89, activeCases: 8, deaths: 12, trend: 'down', history: generateHistory(85, 30) },
  { country: "China", code: "CHN", totalCases: 450, activeCases: 12, deaths: 60, trend: 'flat', history: generateHistory(400, 30) },
  { country: "Bolivia", code: "BOL", totalCases: 54, activeCases: 18, deaths: 9, trend: 'up', history: generateHistory(30, 30) },
  { country: "Paraguay", code: "PRY", totalCases: 34, activeCases: 6, deaths: 5, trend: 'flat', history: generateHistory(25, 30) },
  { country: "Uruguay", code: "URY", totalCases: 21, activeCases: 2, deaths: 3, trend: 'down', history: generateHistory(15, 30) },
  { country: "Canada", code: "CAN", totalCases: 18, activeCases: 1, deaths: 2, trend: 'down', history: generateHistory(12, 30) },
  { country: "Russia", code: "RUS", totalCases: 310, activeCases: 45, deaths: 15, trend: 'up', history: generateHistory(250, 30) },
  { country: "South Korea", code: "KOR", totalCases: 150, activeCases: 10, deaths: 8, trend: 'flat', history: generateHistory(130, 30) },
  { country: "Panama", code: "PAN", totalCases: 45, activeCases: 5, deaths: 7, trend: 'up', history: generateHistory(30, 30) },
  { country: "Germany", code: "DEU", totalCases: 85, activeCases: 4, deaths: 1, trend: 'down', history: generateHistory(80, 30) },
  { country: "France", code: "FRA", totalCases: 65, activeCases: 3, deaths: 0, trend: 'down', history: generateHistory(60, 30) },
  { country: "Sweden", code: "SWE", totalCases: 110, activeCases: 8, deaths: 2, trend: 'flat', history: generateHistory(100, 30) },
  { country: "Finland", code: "FIN", totalCases: 95, activeCases: 5, deaths: 1, trend: 'down', history: generateHistory(85, 30) },
];

export const initialNews: NewsUpdate[] = [
  { id: '1', timestamp: new Date(), country: 'ARG', message: 'Health Ministry issues warning in Patagonia region after cluster identified.', isBreaking: true },
  { id: '2', timestamp: subDays(new Date(), 0.1), country: 'USA', message: 'Yosemite National Park closes specific cabins for deep cleaning.', isBreaking: false },
  { id: '3', timestamp: subDays(new Date(), 0.5), country: 'CHL', message: 'New rapid testing deployment in rural southern regions.', isBreaking: false },
  { id: '4', timestamp: subDays(new Date(), 1), country: 'BOL', message: '2 suspected cases reported in Santa Cruz department, awaiting lab confirmation.', isBreaking: false },
];
