import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    doc, 
    addDoc, 
    deleteDoc, 
    onSnapshot,
    writeBatch,
    setDoc,
    updateDoc
} from 'firebase/firestore';

// --- Helper Functions & Configuration ---
const getAppId = () => typeof __app_id !== 'undefined' ? __app_id : 'fridge-forager-default';

const getFirebaseConfig = () => {
    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && typeof import.meta.env !== 'undefined') {
            // @ts-ignore
            const env = import.meta.env;
            const config = {
                apiKey: env.VITE_FIREBASE_API_KEY,
                authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
                projectId: env.VITE_FIREBASE_PROJECT_ID,
                storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
                messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
                appId: env.VITE_FIREBASE_APP_ID,
            };
            if (Object.values(config).every(value => value)) return config;
        }
        // @ts-ignore
        if (typeof __firebase_config !== 'undefined') { // @ts-ignore
            return JSON.parse(__firebase_config);
        }
        return null;
    } catch (e) {
        console.error("Error parsing Firebase config:", e);
        return null;
    }
};

// --- SVG Icons ---
const PlusIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> );
const TrashIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg> );
const EditIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> );
const XIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> );
const StarIcon = ({ filled = false }) => ( <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> );
const ChevronDownIcon = ({ isCollapsed }) => ( <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-6 w-6 transition-transform duration-300 ${!isCollapsed ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"></polyline></svg> );
const Loader = ({ text = "Loading..." }) => ( <div className="flex flex-col items-center justify-center space-y-4 h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-t-2 border-indigo-600"></div><p className="text-indigo-700 font-medium">{text}</p></div> );

// --- Unit Conversion Logic ---
const conversionRates = {
    'ml': { base: 'ml', multiplier: 1 }, 'l': { base: 'ml', multiplier: 1000 }, 'tsp': { base: 'ml', multiplier: 4.92892 }, 'tbsp': { base: 'ml', multiplier: 14.7868 }, 'cup': { base: 'ml', multiplier: 236.588 },
    'g': { base: 'g', multiplier: 1 }, 'kg': { base: 'g', multiplier: 1000 }, 'oz': { base: 'g', multiplier: 28.3495 }, 'lb': { base: 'g', multiplier: 453.592 },
    'stick': { base: 'g', multiplier: 113 }, 'sticks': { base: 'g', multiplier: 113 },
};
Object.keys(conversionRates).forEach(key => {
    const data = conversionRates[key];
    if (!key.endsWith('s')) conversionRates[key + 's'] = data;
    if (key === 'l') conversionRates['liter'] = data;
    if (key === 'g') conversionRates['gram'] = data;
});

const getNormalizedQuantity = (quantity, unit) => {
    const unitLower = unit ? unit.toLowerCase() : '';
    const conversion = conversionRates[unitLower];
    if (conversion) return { baseQuantity: quantity * conversion.multiplier, baseUnit: conversion.base };
    return { baseQuantity: quantity, baseUnit: unitLower };
};

// --- Main App Component ---
export default function App() {
    // Firebase State
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [user, setUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [authView, setAuthView] = useState('login');

    // App State
    const [ingredients, setIngredients] = useState([]);
    const [recipes, setRecipes] = useState([]);
    const [selectedRecipe, setSelectedRecipe] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [preferences, setPreferences] = useState('');
    const [mealType, setMealType] = useState('any');
    const [isCookingMode, setIsCookingMode] = useState(false);
    const [recentlyCooked, setRecentlyCooked] = useState([]);
    const [favoritedRecipes, setFavoritedRecipes] = useState([]);
    const [shoppingList, setShoppingList] = useState([]);
    const [isPantryCollapsed, setIsPantryCollapsed] = useState(true);
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);

    const appId = getAppId();

    // --- Firebase Initialization and Auth Listener ---
    useEffect(() => {
        const firebaseConfig = getFirebaseConfig();
        if (firebaseConfig && !db) {
            try {
                const app = initializeApp(firebaseConfig);
                const firestore = getFirestore(app);
                const authInstance = getAuth(app);
                setDb(firestore);
                setAuth(authInstance);
                onAuthStateChanged(authInstance, (user) => { setUser(user); setIsAuthReady(true); });
            } catch (e) {
                console.error("Firebase initialization failed:", e);
                setError("Could not connect to the database.");
                setIsAuthReady(true);
            }
        } else if (!firebaseConfig) {
             setError("Firebase is not configured. Data cannot be saved.");
             setIsAuthReady(true);
        }
    }, [db]);

    // --- Firestore Data Sync ---
    useEffect(() => {
        if (user && db) {
            const collectionsToSync = { ingredients: setIngredients, recentlyCooked: setRecentlyCooked, favoritedRecipes: setFavoritedRecipes, shoppingList: setShoppingList };
            const unsubscribers = Object.entries(collectionsToSync).map(([collectionName, setter]) => {
                const collRef = collection(db, `artifacts/${appId}/users/${user.uid}/${collectionName}`);
                return onSnapshot(collRef, (snapshot) => {
                    const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                    setter(data);
                }, (err) => {
                    console.error(`Error syncing ${collectionName}:`, err);
                    setError(`Could not load ${collectionName.replace(/([A-Z])/g, ' $1')}.`);
                });
            });
            return () => unsubscribers.forEach(unsub => unsub());
        } else {
            setIngredients([]); setRecentlyCooked([]); setFavoritedRecipes([]); setShoppingList([]);
        }
    }, [user, db, appId]);

    // --- Auth Actions ---
    const handleAuthAction = async (action, email, password) => {
        setError(null);
        try {
            if (action === 'register') await createUserWithEmailAndPassword(auth, email, password);
            else await signInWithEmailAndPassword(auth, email, password);
        } catch (err) { setError(err.message); }
    };
    const handleLogout = async () => { if (auth) await signOut(auth); };

    // --- Ingredient Management ---
    const handleAddIngredient = async (ingredientData) => {
        if (!user) return;
        const newIngredient = { ...ingredientData, createdAt: Date.now() };
        try {
            await addDoc(collection(db, `artifacts/${appId}/users/${user.uid}/ingredients`), newIngredient);
        } catch (err) { console.error("Error adding ingredient:", err); }
    };
    const handleUpdateIngredient = async (ingredientId, updatedData) => {
        if (!user) return;
        try {
            const ingredientDoc = doc(db, `artifacts/${appId}/users/${user.uid}/ingredients`, ingredientId);
            await updateDoc(ingredientDoc, updatedData);
        } catch (err) { console.error("Error updating ingredient:", err); }
    };
    const handleDeleteIngredient = async (ingredientId) => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${user.uid}/ingredients`, ingredientId));
        } catch (err) { console.error("Error deleting ingredient:", err); }
    };

    // --- Shopping List Management ---
    const handleAddToShoppingList = async (itemData) => {
        if (!user || !itemData.name.trim()) return;
        try {
            await addDoc(collection(db, `artifacts/${appId}/users/${user.uid}/shoppingList`), itemData);
        } catch (err) { console.error("Error adding to shopping list:", err); }
    };
    const handleDeleteFromShoppingList = async (itemId) => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${user.uid}/shoppingList`, itemId));
        } catch (err) { console.error("Error deleting from shopping list:", err); }
    };
    const handleMoveToPantry = async (itemsToMove) => {
        if (!user || itemsToMove.length === 0) return;
        const batch = writeBatch(db);
        itemsToMove.forEach(item => {
            const ingredientData = { name: item.name, quantity: parseFloat(item.quantity) || 0, unit: item.unit, createdAt: Date.now() };
            const newIngredientRef = doc(collection(db, `artifacts/${appId}/users/${user.uid}/ingredients`));
            batch.set(newIngredientRef, ingredientData);
            const shoppingListItemRef = doc(db, `artifacts/${appId}/users/${user.uid}/shoppingList`, item.id);
            batch.delete(shoppingListItemRef);
        });
        try {
            await batch.commit();
            setIsMoveModalOpen(false);
        } catch (err) { console.error("Error moving items to pantry:", err); }
    };


    // --- Recipe Generation ---
    const findRecipes = async () => {
        if (ingredients.length === 0) { setError("Please add some ingredients to your pantry first!"); return; }
        setIsLoading(true); setError(null); setRecipes([]); setSelectedRecipe(null);
        const ingredientsString = ingredients.map(i => `${i.quantity} ${i.unit} ${i.name}`).join(', ');
        let prompt = `You are a helpful culinary assistant. Based ONLY on the following list of available ingredients, generate 3 diverse recipe options. For each recipe, provide a name, a short description, a list of the ingredients needed from the pantry, and step-by-step instructions. Ensure the needed ingredients do not exceed the available quantities. Available ingredients: ${ingredientsString}.`;
        if (mealType !== 'any') prompt += ` The user is looking for a ${mealType} recipe.`;
        if (preferences.trim()) prompt += ` The user also has the following preferences, please try to accommodate them: ${preferences.trim()}.`;
        const schema = { type: "ARRAY", items: { type: "OBJECT", properties: { recipeName: { type: "STRING" }, description: { type: "STRING" }, ingredientsNeeded: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, quantity: { type: "NUMBER" }, unit: { type: "STRING" } }, required: ["name", "quantity", "unit"] } }, instructions: { type: "ARRAY", items: { type: "STRING" } } }, required: ["recipeName", "description", "ingredientsNeeded", "instructions"] } };
        try {
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema } };
            // @ts-ignore
            const apiKey = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_FIREBASE_API_KEY : '';
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);
            const result = await response.json();
            if (result.candidates && result.candidates.length > 0) {
                const jsonText = result.candidates[0].content.parts[0].text;
                setRecipes(JSON.parse(jsonText));
            } else { throw new Error("No recipes were generated. Try adding more ingredients."); }
        } catch (err) { console.error("Error fetching recipes:", err); setError(`Failed to find recipes. ${err.message}`); } finally { setIsLoading(false); }
    };
    
    // --- Cooking & Recipe History Logic ---
    const checkIngredients = (recipe) => {
        const ingredientsCopy = JSON.parse(JSON.stringify(ingredients));
        const pantryMap = new Map(ingredientsCopy.map(i => [i.name.toLowerCase(), i]));
        for (const needed of recipe.ingredientsNeeded) {
            const neededNameLower = needed.name.toLowerCase();
            let available = pantryMap.get(neededNameLower);
            if (!available) {
                for (const [pantryName, pantryIngredient] of pantryMap.entries()) {
                    if (pantryName.includes(neededNameLower) || neededNameLower.includes(pantryName)) { available = pantryIngredient; break; }
                }
            }
            if (!available) { setError(`You don't have any ${needed.name} (or a similar ingredient).`); return false; }
            const availableNormalized = getNormalizedQuantity(available.quantity, available.unit);
            const neededNormalized = getNormalizedQuantity(needed.quantity, needed.unit);
            if (availableNormalized.baseUnit === neededNormalized.baseUnit) {
                if (availableNormalized.baseQuantity < neededNormalized.baseQuantity) { setError(`Not enough ${needed.name}. You need ${needed.quantity} ${needed.unit} but only have ${available.quantity} ${available.unit}.`); return false; }
            } else {
                 if (available.quantity < needed.quantity) { setError(`Not enough ${needed.name}. You need ${needed.quantity} ${needed.unit} but only have ${available.quantity} ${available.unit}.`); return false; }
            }
        }
        return true;
    };

    const handleFinishCooking = async () => {
        const recipe = selectedRecipe;
        if (!recipe || !user) return;
        if (!checkIngredients(recipe)) { setIsCookingMode(false); return; }

        const batch = writeBatch(db);
        const ingredientsCopy = JSON.parse(JSON.stringify(ingredients));
        const updatedIngredientsMap = new Map(ingredientsCopy.map(i => [i.name.toLowerCase(), i]));

        for (const needed of recipe.ingredientsNeeded) {
            const neededNameLower = needed.name.toLowerCase();
            let available = updatedIngredientsMap.get(neededNameLower);
            if (!available) {
                for (const [pantryName, pantryIngredient] of updatedIngredientsMap.entries()) {
                    if (pantryName.includes(neededNameLower) || neededNameLower.includes(pantryName)) { available = pantryIngredient; break; }
                }
            }
            const availableNormalized = getNormalizedQuantity(available.quantity, available.unit);
            const neededNormalized = getNormalizedQuantity(needed.quantity, needed.unit);
            const neededInOriginalUnit = neededNormalized.baseQuantity / (conversionRates[available.unit.toLowerCase()]?.multiplier || 1);
            available.quantity -= neededInOriginalUnit;
        }

        for (const ingredient of updatedIngredientsMap.values()) {
            const docRef = doc(db, `artifacts/${appId}/users/${user.uid}/ingredients`, ingredient.id);
            if (ingredient.quantity <= 0.001) batch.delete(docRef);
            else batch.update(docRef, { quantity: ingredient.quantity });
        }
        
        const recipeId = recipe.id || `${Date.now()}-${recipe.recipeName.replace(/\s/g, '-')}`;
        const cookedRecipe = { ...recipe, id: recipeId, cookedAt: Date.now() };
        const recentDocRef = doc(db, `artifacts/${appId}/users/${user.uid}/recentlyCooked`, recipeId);
        batch.set(recentDocRef, cookedRecipe);

        try {
            await batch.commit();
            setSelectedRecipe(null); setRecipes([]); setIsCookingMode(false);
            setError({type: 'success', message: `Enjoy your ${recipe.recipeName}! Your pantry has been updated.`});
            setTimeout(() => setError(null), 5000);
        } catch (err) { console.error("Error finishing cooking:", err); setError("Failed to update pantry."); }
    };

    const handleFavoriteRecipe = async (recipe) => {
        if (!user) return;
        const recipeId = recipe.id || `${Date.now()}-${recipe.recipeName.replace(/\s/g, '-')}`;
        const favDocRef = doc(db, `artifacts/${appId}/users/${user.uid}/favoritedRecipes`, recipeId);
        const isFavorited = favoritedRecipes.some(r => r.id === recipeId);
        try {
            if (isFavorited) await deleteDoc(favDocRef);
            else await setDoc(favDocRef, { ...recipe, id: recipeId });
        } catch (err) { console.error("Error favoriting recipe:", err); }
    };
    
    // --- Navigation & Render Logic ---
    if (!isAuthReady) return <div className="bg-gray-50 min-h-screen flex items-center justify-center"><Loader text="Connecting to services..." /></div>;
    if (!user) return <AuthScreen onAuth={handleAuthAction} view={authView} setView={setAuthView} error={error} setError={setError} />;
    if (isCookingMode && selectedRecipe) return <CookingView recipe={selectedRecipe} onFinishCooking={handleFinishCooking} />;

    const renderMainContent = () => {
        if (isLoading) return <Loader text="Finding recipes..." />;
        if (selectedRecipe) return <RecipeDetail recipe={selectedRecipe} onStartCooking={() => { if(checkIngredients(selectedRecipe)) setIsCookingMode(true); }} onBack={() => setSelectedRecipe(null)} />;
        if (recipes.length > 0) return <RecipeList recipes={recipes} onSelect={setSelectedRecipe} onBack={() => setRecipes([])} />;
        
        return (
            <div className="space-y-8">
                <PantrySection ingredients={ingredients} onDelete={handleDeleteIngredient} onAdd={handleAddIngredient} onUpdate={handleUpdateIngredient} isCollapsed={isPantryCollapsed} setIsCollapsed={setIsPantryCollapsed} />
                <ShoppingListSection shoppingList={shoppingList} onAdd={handleAddToShoppingList} onDelete={handleDeleteFromShoppingList} onMove={() => setIsMoveModalOpen(true)} />
                <HistorySection favoritedRecipes={favoritedRecipes} recentlyCooked={recentlyCooked} onCookAgain={(r) => { if(checkIngredients(r)) { setSelectedRecipe(r); setIsCookingMode(true); } }} onFavorite={handleFavoriteRecipe} favoritedIds={favoritedRecipes.map(r => r.id)} />
            </div>
        );
    };

    return (
        <div className="bg-gray-50 min-h-screen font-sans text-gray-800">
            {isMoveModalOpen && <MoveToPantryModal items={shoppingList} onConfirm={handleMoveToPantry} onCancel={() => setIsMoveModalOpen(false)} />}
            <div className="container mx-auto p-4 md:p-8">
                <header className="text-center mb-8 relative">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 flex items-center justify-center">Fridge Forager</h1>
                    <p className="text-gray-600 mt-2">What can we make with what you have?</p>
                    <button onClick={handleLogout} className="absolute top-0 right-0 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500">Logout</button>
                </header>
                {error && ( <div className={`p-4 mb-6 rounded-lg text-center ${typeof error === 'object' && error.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`} role="alert">{typeof error === 'string' ? error : error.message}</div> )}
                <div className="space-y-8">
                    {!selectedRecipe && recipes.length === 0 && ( <FindRecipeSection onFindRecipes={findRecipes} preferences={preferences} setPreferences={setPreferences} mealType={mealType} setMealType={setMealType} hasIngredients={ingredients.length > 0} /> )}
                    {renderMainContent()}
                </div>
            </div>
        </div>
    );
}

// --- Auth & Layout Components ---

const AuthScreen = ({ onAuth, view, setView, error, setError }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const handleSubmit = (e) => { e.preventDefault(); onAuth(view, email, password); };
    const toggleView = () => { setError(null); setView(v => v === 'login' ? 'register' : 'login'); };
    return (
        <div className="bg-gray-50 min-h-screen flex flex-col items-center justify-center p-4">
            <div className="text-center mb-8"><h1 className="text-4xl md:text-5xl font-bold text-gray-900">Fridge Forager</h1><p className="text-gray-600 mt-2">Your personal kitchen assistant</p></div>
            <div className="w-full max-w-md bg-white rounded-xl shadow-md border border-gray-200 p-8">
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">{view === 'login' ? 'Welcome Back!' : 'Create Your Account'}</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div><label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label><input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required /></div>
                    <div><label htmlFor="password"className="block text-sm font-medium text-gray-700">Password</label><input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" required /></div>
                    {error && (<p className="text-sm text-red-600 text-center">{error}</p>)}
                    <button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">{view === 'login' ? 'Login' : 'Register'}</button>
                </form>
                <p className="mt-6 text-center text-sm text-gray-600">{view === 'login' ? "Don't have an account?" : "Already have an account?"}<button onClick={toggleView} className="font-medium text-indigo-600 hover:text-indigo-500 ml-1">{view === 'login' ? 'Register here' : 'Login here'}</button></p>
            </div>
        </div>
    );
};

const FindRecipeSection = ({ onFindRecipes, preferences, setPreferences, mealType, setMealType, hasIngredients }) => {
    const mealTypes = ['Any', 'Breakfast', 'Lunch', 'Dinner', 'Snack'];
    return (
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Find a Recipe</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">What meal are you making?</label>
                    <div className="flex flex-wrap gap-2">
                        {mealTypes.map((type) => (<button key={type} onClick={() => setMealType(type.toLowerCase())} className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${ mealType === type.toLowerCase() ? 'bg-indigo-600 text-white shadow' : 'bg-white text-gray-700 hover:bg-indigo-100 border border-gray-300' }`}>{type}</button>))}
                    </div>
                </div>
                <div>
                     <label htmlFor="preferences" className="block text-sm font-medium text-gray-700 mb-2">Other Cuisines, Diets, or Preferences</label>
                     <input type="text" id="preferences" name="preferences" value={preferences} onChange={(e) => setPreferences(e.target.value)} placeholder="e.g., vegetarian, Italian, quick and easy" className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                </div>
            </div>
            <div className="mt-6"><button onClick={onFindRecipes} disabled={!hasIngredients} className="w-full flex-shrink-0 flex justify-center items-center py-3 px-6 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed">Find Recipes!</button></div>
        </div>
    );
};

const PantrySection = ({ ingredients, onDelete, onAdd, onUpdate, isCollapsed, setIsCollapsed }) => {
    const [editingId, setEditingId] = useState(null);
    const [sortOrder, setSortOrder] = useState('alpha');

    const sortedIngredients = [...ingredients].sort((a, b) => {
        if (sortOrder === 'date') {
            return (a.createdAt || 0) - (b.createdAt || 0);
        }
        return a.name.localeCompare(b.name);
    });

    return (
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsCollapsed(!isCollapsed)}>
                <h2 className="text-2xl font-semibold text-gray-800">Your Pantry</h2>
                <button className="text-gray-600 hover:text-indigo-600" aria-label="Toggle Pantry"><ChevronDownIcon isCollapsed={isCollapsed} /></button>
            </div>
            {!isCollapsed && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 mt-4 border-t">
                    <IngredientForm onSave={onAdd} title="Add Ingredient" />
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-gray-700">Current Ingredients</h3>
                            <div className="flex gap-2">
                                <button onClick={() => setSortOrder('alpha')} className={`px-2 py-1 text-xs rounded-md ${sortOrder === 'alpha' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}>A-Z</button>
                                <button onClick={() => setSortOrder('date')} className={`px-2 py-1 text-xs rounded-md ${sortOrder === 'date' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}>Date</button>
                            </div>
                        </div>
                        {ingredients.length === 0 ? <p className="text-gray-500 text-center py-8">Your pantry is empty.</p> : (
                            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                                {sortedIngredients.map(ing => (
                                    <div key={ing.id}>
                                        {editingId === ing.id ? (
                                            <IngredientForm
                                                initialData={ing}
                                                onSave={(data) => { onUpdate(ing.id, data); setEditingId(null); }}
                                                onCancel={() => setEditingId(null)}
                                                isEditing={true}
                                            />
                                        ) : (
                                            <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border">
                                                <div>
                                                    <span className="font-medium text-gray-700">{ing.name}</span>
                                                    {ing.createdAt && <p className="text-xs text-gray-500">Added: {new Date(ing.createdAt).toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' })}</p>}
                                                </div>
                                                <div className="flex items-center space-x-3">
                                                    <span className="text-gray-600">{ing.quantity} {ing.unit}</span>
                                                    <button onClick={() => setEditingId(ing.id)} className="text-blue-500 hover:text-blue-700" aria-label={`Edit ${ing.name}`}><EditIcon /></button>
                                                    <button onClick={() => onDelete(ing.id)} className="text-red-500 hover:text-red-700" aria-label={`Delete ${ing.name}`}><TrashIcon /></button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const HistorySection = ({ favoritedRecipes, recentlyCooked, onCookAgain, onFavorite, favoritedIds }) => (
     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <FavoritedRecipesList recipes={favoritedRecipes} onCookAgain={onCookAgain} onFavorite={onFavorite} />
        <RecentlyCookedList recipes={recentlyCooked} onFavorite={onFavorite} favoritedIds={favoritedIds} />
     </div>
);

const IngredientForm = ({ onSave, title, initialData = { name: '', quantity: '', unit: '' }, isEditing = false, onCancel }) => {
    const [ingredient, setIngredient] = useState(initialData);
    const [unit, setUnit] = useState(initialData.unit && !['g', 'kg', 'oz', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'each', 'whole', 'stick'].includes(initialData.unit) ? 'other' : initialData.unit || 'g');
    const commonUnits = ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'each', 'whole', 'stick', 'other'];

    const handleChange = (e) => {
        const { name, value } = e.target;
        setIngredient(prev => ({ ...prev, [name]: value }));
    };

    const handleUnitChange = (e) => {
        const { value } = e.target;
        setUnit(value);
        if (value !== 'other') {
            setIngredient(prev => ({ ...prev, unit: value }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!ingredient.name.trim() || !ingredient.quantity) return;
        onSave(ingredient);
        if (!isEditing) {
            setIngredient({ name: '', quantity: '', unit: '' });
            setUnit('g');
        }
    };

    return (
        <div className={isEditing ? "bg-indigo-50 p-4 rounded-lg" : ""}>
            <h3 className="text-xl font-semibold text-gray-700 mb-4">{title}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div><label htmlFor="name" className="block text-sm font-medium text-gray-700">Ingredient Name</label><input type="text" id="name" name="name" value={ingredient.name} onChange={handleChange} placeholder="e.g., Flour" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 sm:text-sm" required /></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label htmlFor="quantity" className="block text-sm font-medium text-gray-700">Quantity</label><input type="number" id="quantity" name="quantity" value={ingredient.quantity} onChange={handleChange} placeholder="e.g., 500" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 sm:text-sm" required /></div>
                    <div><label htmlFor="unit" className="block text-sm font-medium text-gray-700">Unit</label><select id="unit" name="unit-select" value={unit} onChange={handleUnitChange} className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 sm:text-sm">{commonUnits.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                </div>
                {unit === 'other' && <div><label htmlFor="custom-unit" className="block text-sm font-medium text-gray-700">Custom Unit</label><input type="text" id="custom-unit" name="unit" value={ingredient.unit} onChange={handleChange} placeholder="e.g., bunch" className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 sm:text-sm" /></div>}
                <div className="flex gap-2">
                    <button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">{isEditing ? 'Save' : <><PlusIcon /> Add Ingredient</>}</button>
                    {isEditing && <button type="button" onClick={onCancel} className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Cancel</button>}
                </div>
            </form>
        </div>
    );
};

const RecipeList = ({ recipes, onSelect, onBack }) => (
    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
        <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-semibold text-gray-800">Recipe Suggestions</h2><button onClick={onBack} className="py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Back</button></div>
        <div className="space-y-4">{recipes.map((recipe, index) => (<div key={index} className="bg-gray-50 p-4 rounded-lg border hover:border-indigo-500 transition-all cursor-pointer" onClick={() => onSelect(recipe)}><h3 className="text-xl font-bold text-indigo-700">{recipe.recipeName}</h3><p className="text-gray-600 mt-1">{recipe.description}</p></div>))}</div>
    </div>
);

const RecipeDetail = ({ recipe, onStartCooking, onBack }) => (
     <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
        <div className="flex justify-between items-start mb-4"><h2 className="text-3xl font-bold text-gray-800">{recipe.recipeName}</h2><button onClick={onBack} className="text-gray-500 hover:text-gray-800"><XIcon /></button></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1"><h3 className="text-lg font-semibold mb-2 text-gray-700 border-b pb-2">Ingredients Needed</h3><ul className="space-y-1 text-gray-600">{recipe.ingredientsNeeded.map((ing, index) => ( <li key={index}>{ing.quantity} {ing.unit} {ing.name}</li> ))}</ul></div>
            <div className="md:col-span-2"><h3 className="text-lg font-semibold mb-2 text-gray-700 border-b pb-2">Instructions</h3><ol className="space-y-2 text-gray-600 list-decimal list-inside">{recipe.instructions.map((step, index) => ( <li key={index}>{step}</li> ))}</ol></div>
        </div>
        <div className="mt-8 text-center"><button onClick={onStartCooking} className="py-3 px-8 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">Cook This!</button></div>
    </div>
);

const CookingView = ({ recipe, onFinishCooking }) => (
    <div className="bg-white min-h-screen p-4 sm:p-6 md:p-8">
        <div className="max-w-4xl mx-auto">
            <header className="text-center mb-8"><h1 className="text-4xl md:text-5xl font-bold text-gray-900">{recipe.recipeName}</h1><p className="text-gray-600 mt-2">{recipe.description}</p></header>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-1 bg-gray-50 p-6 rounded-xl border"><h3 className="text-2xl font-semibold mb-4 text-gray-800">Ingredients</h3><ul className="space-y-2 text-gray-700">{recipe.ingredientsNeeded.map((ing, index) => ( <li key={index} className="flex items-start"><span className="font-bold mr-2 text-indigo-600">&bull;</span><span>{ing.quantity} {ing.unit} {ing.name}</span></li> ))}</ul></div>
                <div className="md:col-span-2"><h3 className="text-2xl font-semibold mb-4 text-gray-800">Instructions</h3><ol className="space-y-4 text-gray-700 leading-relaxed">{recipe.instructions.map((step, index) => ( <li key={index} className="flex"><span className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-indigo-600 text-white font-bold mr-4">{index + 1}</span><p>{step}</p></li> ))}</ol></div>
            </div>
            <div className="mt-12 text-center"><button onClick={onFinishCooking} className="py-3 px-8 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">Finish Cooking & Update Pantry</button></div>
        </div>
    </div>
);

const RecentlyCookedList = ({ recipes, onFavorite, favoritedIds }) => (
    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Recently Cooked</h2>
        {recipes.length === 0 ? <p className="text-gray-500">No recently cooked meals.</p> : (<div className="space-y-3">{recipes.map(recipe => (<div key={recipe.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border"><span className="font-medium text-gray-700 truncate pr-2">{recipe.recipeName}</span><button onClick={() => onFavorite(recipe)} className="text-yellow-400 hover:text-yellow-500" aria-label="Favorite this recipe"><StarIcon filled={favoritedIds.includes(recipe.id)} /></button></div>))}</div>)}
    </div>
);

const FavoritedRecipesList = ({ recipes, onCookAgain, onFavorite }) => (
    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Saved Recipes</h2>
        {recipes.length === 0 ? <p className="text-gray-500">You haven't saved any recipes yet.</p> : (<div className="space-y-3">{recipes.map(recipe => (<div key={recipe.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border"><span className="font-medium text-gray-700 truncate pr-2">{recipe.recipeName}</span><div className="flex items-center space-x-2"><button onClick={() => onCookAgain(recipe)} className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold">Cook Again</button><button onClick={() => onFavorite(recipe)} className="text-yellow-400 hover:text-yellow-500" aria-label="Unfavorite this recipe"><StarIcon filled={true} /></button></div></div>))}</div>)}
    </div>
);

// --- Shopping List Components ---

const ShoppingListSection = ({ shoppingList, onAdd, onDelete, onMove }) => {
    const [newItem, setNewItem] = useState({ name: '', quantity: '' });
    const [isCollapsed, setIsCollapsed] = useState(true);
    const sortedShoppingList = [...shoppingList].sort((a, b) => a.name.localeCompare(b.name));

    const handleSubmit = (e) => {
        e.preventDefault();
        onAdd(newItem);
        setNewItem({ name: '', quantity: '' });
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
            <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsCollapsed(!isCollapsed)}>
                <h2 className="text-2xl font-semibold text-gray-800">Shopping List</h2>
                <button className="text-gray-600 hover:text-indigo-600" aria-label="Toggle Shopping List"><ChevronDownIcon isCollapsed={isCollapsed} /></button>
            </div>
            {!isCollapsed && (
                <div className="pt-6 mt-4 border-t">
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                        <input type="text" value={newItem.name} onChange={(e) => setNewItem(prev => ({...prev, name: e.target.value}))} placeholder="Add an item..." className="sm:col-span-2 px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 sm:text-sm" />
                        <div className="flex gap-2">
                            <input type="text" value={newItem.quantity} onChange={(e) => setNewItem(prev => ({...prev, quantity: e.target.value}))} placeholder="Qty" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 sm:text-sm" />
                            <button type="submit" className="flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"><PlusIcon /></button>
                        </div>
                    </form>
                    {shoppingList.length === 0 ? <p className="text-gray-500">Your shopping list is empty.</p> : (
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                            {sortedShoppingList.map(item => (
                                <div key={item.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border">
                                    <span className="font-medium text-gray-700">{item.name} <span className="text-gray-500 text-sm">({item.quantity})</span></span>
                                    <button onClick={() => onDelete(item.id)} className="text-red-500 hover:text-red-700" aria-label={`Delete ${item.name}`}><TrashIcon /></button>
                                </div>
                            ))}
                        </div>
                    )}
                    <button onClick={onMove} disabled={shoppingList.length === 0} className="w-full mt-4 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed">Move to Pantry</button>
                </div>
            )}
        </div>
    );
};

const MoveToPantryModal = ({ items, onConfirm, onCancel }) => {
    const [listItems, setListItems] = useState([]);

    useEffect(() => {
        const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name));
        setListItems(sortedItems.map(item => ({ ...item, checked: true, quantity: 1, unit: 'each' })));
    }, [items]);

    const handleItemChange = (id, field, value) => {
        setListItems(currentItems =>
            currentItems.map(item => (item.id === id ? { ...item, [field]: value } : item))
        );
    };

    const handleConfirm = () => {
        const itemsToMove = listItems.filter(item => item.checked);
        onConfirm(itemsToMove);
    };
    
    const commonUnits = ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'each', 'whole', 'stick'];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-semibold">Add to Pantry</h2>
                    <button onClick={onCancel} className="text-gray-500 hover:text-gray-800"><XIcon /></button>
                </div>
                <p className="text-gray-600 mb-4">Uncheck any items you didn't buy and adjust quantities.</p>
                <div className="flex-grow overflow-y-auto space-y-3 pr-2">
                    {listItems.map(item => (
                        <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <input type="checkbox" checked={item.checked} onChange={(e) => handleItemChange(item.id, 'checked', e.target.checked)} className="h-5 w-5 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300" />
                            <span className={`flex-grow font-medium ${!item.checked ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.name}</span>
                            <input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded-md" disabled={!item.checked} />
                            <select value={item.unit} onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)} className="px-2 py-1 border border-gray-300 rounded-md" disabled={!item.checked}>
                                {commonUnits.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                    ))}
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onCancel} className="py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Cancel</button>
                    <button onClick={handleConfirm} className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">Confirm & Add</button>
                </div>
            </div>
        </div>
    );
};
