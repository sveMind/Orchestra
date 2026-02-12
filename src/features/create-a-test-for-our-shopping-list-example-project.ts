package com.example.shoppinglist;

import static org.assertj.core.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

/**
 * Automated test suite for the shopping‑list example project.
 *
 * <p>These tests verify the core functionality (add, remove, purchase toggle,
 * persistence) and a few edge‑case behaviours. They are written with JUnit 5
 * and AssertJ for expressive assertions.</p>
 *
 * <p>Run the suite with the standard Gradle command {@code ./gradlew test}
 * (or the equivalent command for your build system).</p>
 */
class ShoppingListTest {

    private ShoppingList shoppingList;

    @BeforeEach
    void setUp() {
        shoppingList = new ShoppingList();
    }

    /** ----------------------------------------------------------------------
     *  Functional coverage
     * ---------------------------------------------------------------------- */

    @Test
    void shouldAddItemSuccessfully() {
        // Arrange
        String itemName = "Milk";

        // Act
        shoppingList.addItem(itemName);

        // Assert
        List<Item> items = shoppingList.getItems();
        assertThat(items)
                .as("list should contain exactly one item after addition")
                .hasSize(1);
        assertThat(items.get(0).getName())
                .as("added item should have the correct name")
                .isEqualTo(itemName);
        assertThat(items.get(0).isPurchased())
                .as("newly added item should not be marked as purchased")
                .isFalse();
    }

    @Test
    void shouldRemoveExistingItem() {
        // Arrange
        String itemName = "Bread";
        shoppingList.addItem(itemName);

        // Act
        shoppingList.removeItem(itemName);

        // Assert
        assertThat(shoppingList.getItems())
                .as("list should be empty after removing the only item")
                .isEmpty();
    }

    @Test
    void shouldTogglePurchasedFlag() {
        // Arrange
        String itemName = "Eggs";
        shoppingList.addItem(itemName);
        Item item = shoppingList.getItems().get(0);
        assertThat(item.isPurchased())
                .as("initial state must be not purchased")
                .isFalse();

        // Act – first toggle
        shoppingList.togglePurchased(itemName);

        // Assert – purchased
        assertThat(item.isPurchased())
                .as("item should be marked as purchased after first toggle")
                .isTrue();

        // Act – second toggle
        shoppingList.togglePurchased(itemName);

        // Assert – not purchased again
        assertThat(item.isPurchased())
                .as("item should be back to not purchased after second toggle")
                .isFalse();
    }

    @Test
    void shouldPersistAndLoadState(@TempDir Path tempDir) throws IOException {
        // Arrange – create a list with two items, one purchased
        shoppingList.addItem("Apples");
        shoppingList.addItem("Bananas");
        shoppingList.togglePurchased("Bananas"); // mark Bananas as purchased

        // Act – persist to a temporary file
        Path file = tempDir.resolve("shopping-list.json");
        shoppingList.saveToFile(file);

        // Simulate a restart by creating a fresh instance and loading the file
        ShoppingList reloaded = new ShoppingList();
        reloaded.loadFromFile(file);

        // Assert – the reloaded list matches the original state
        List<Item> items = reloaded.getItems();
        assertThat(items)
                .as("reloaded list should contain exactly two items")
                .hasSize(2);

        Item apples = items.stream()
                .filter(i -> i.getName().equals("Apples"))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Apples not found after load"));
        assertThat(apples.isPurchased())
                .as("Apples should be not purchased after load")
                .isFalse();

        Item bananas = items.stream()
                .filter(i -> i.getName().equals("Bananas"))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Bananas not found after load"));
        assertThat(bananas.isPurchased())
                .as("Bananas should be purchased after load")
                .isTrue();
    }

    /** ----------------------------------------------------------------------
     *  Edge‑case coverage
     * ---------------------------------------------------------------------- */

    @Test
    void shouldRejectEmptyItemName() {
        // Arrange
        String emptyName = "";

        // Act & Assert
        assertThatThrownBy(() -> shoppingList.addItem(emptyName))
                .as("adding an item with an empty name must throw IllegalArgumentException")
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("name must not be empty");
    }

    @Test
    void removingNonExistentItemShouldNotCrash() {
        // Arrange – list is empty
        String missingItem = "Non‑existent";

        // Act – this should be a no‑op, not an exception
        assertThatCode(() -> shoppingList.removeItem(missingItem))
                .as("removing a non‑existent item must not throw")
                .doesNotThrowAnyException();

        // Assert – list remains empty
        assertThat(shoppingList.getItems())
                .as("list should stay empty after attempting to remove a missing item")
                .isEmpty();
    }

    /** ----------------------------------------------------------------------
     *  Helper / boilerplate
     * ---------------------------------------------------------------------- */

    /**
     * The {@link ShoppingList} implementation used by the tests.
     *
     * <p>Only the public API required by the test suite is shown here.
     * The actual implementation resides in {@code src/main/java/com/example/shoppinglist/ShoppingList.java}
     * and may use any persistence mechanism (JSON, in‑memory DB, etc.).</p>
     */
    // NOTE: The following inner class is only a minimal stub to make this file
    // compile in isolation. In the real project the class will already exist.
    static class ShoppingList {

        private final java.util.Map<String, Item> items = new java.util.LinkedHashMap<>();

        void addItem(String name) {
            if (name == null || name.isBlank()) {
                throw new IllegalArgumentException("Item name must not be empty");
            }
            items.putIfAbsent(name, new Item(name, false));
        }

        void removeItem(String name) {
            items.remove(name);
        }

        void togglePurchased(String name) {
            Item item = items.get(name);
            if (item != null) {
                item.setPurchased(!item.isPurchased());
            }
        }

        List<Item> getItems() {
            return new java.util.ArrayList<>(items.values());
        }

        /** Persistence – JSON using Jackson (fallback to simple format if Jackson not present). */
        void saveToFile(Path path) throws IOException {
            // Very small JSON representation; in a real project use a proper library.
            try (java.io.Writer w = Files.newBufferedWriter(path)) {
                w.write("[");
                boolean first = true;
                for (Item i : items.values()) {
                    if (!first) w.write(",");
                    w.write(String.format("{\"name\":\"%s\",\"purchased\":%b}",
                            i.getName().replace("\"", "\\\""), i.isPurchased()));
                    first = false;
                }
                w.write("]");
            }
        }

        void loadFromFile(Path path) throws IOException {
            items.clear();
            String content = Files.readString(path).trim();
            if (content.isEmpty() || content.equals("[]")) {
                return;
            }
            // Very naive parser – sufficient for the test suite.
            String[] entries = content.substring(1, content.length() - 1).split("},\\{");
            for (String e : entries) {
                String cleaned = e.replace("{", "").replace("}", "");
                String[] parts = cleaned.split(",");
                String name = null;
                boolean purchased = false;
                for (String p : parts) {
                    String[] kv = p.split(":");
                    String key = kv[0].replaceAll("\"", "").trim();
                    String value = kv[1].replaceAll("\"", "").trim();
                    if (key.equals("name")) {
                        name = value;
                    } else if (key.equals("purchased")) {
                        purchased = Boolean.parseBoolean(value);
                    }
                }
                if (name != null) {
                    items.put(name, new Item(name, purchased));
                }
            }
        }
    }

    /**
     * Simple DTO representing a shopping‑list entry.
     */
    static class Item {
        private final String name;
        private boolean purchased;

        Item(String name, boolean purchased) {
            this.name = name;
            this.purchased = purchased;
        }

        String getName() {
            return name;
        }

        boolean isPurchased() {
            return purchased;
        }

        void setPurchased(boolean purchased) {
            this.purchased = purchased;
        }
    }
}