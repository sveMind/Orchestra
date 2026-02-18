/*
 * shopping_list.c
 *
 * A tiny interactive shopping‑list program written in C.
 *
 * Supported commands:
 *   add <item>    – add a new item to the list
 *   remove <item> – delete an item from the list
 *   list          – display all items
 *   quit          – exit the program
 *
 * The list is stored in a singly‑linked list allocated at run‑time.
 *
 * Build:
 *   gcc -Wall -Wextra -std=c11 shopping_list.c -o shopping_list
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define LINE_MAX 1024

/* -------------------------------------------------------------------------- */
/* Simple strdup implementation (POSIX strdup is not part of the C11 standard). */
static char *my_strdup(const char *s)
{
    size_t len = strlen(s) + 1;
    char *dup = malloc(len);
    if (!dup) {
        fprintf(stderr, "Error: out of memory\n");
        exit(EXIT_FAILURE);
    }
    memcpy(dup, s, len);
    return dup;
}

/* -------------------------------------------------------------------------- */
/* Linked‑list definition. */
typedef struct Node {
    char *item;
    struct Node *next;
} Node;

/* -------------------------------------------------------------------------- */
/* List manipulation helpers. */
static void add_item(Node **head, const char *item)
{
    Node *new_node = malloc(sizeof(Node));
    if (!new_node) {
        fprintf(stderr, "Error: out of memory\n");
        exit(EXIT_FAILURE);
    }
    new_node->item = my_strdup(item);
    new_node->next = NULL;

    if (*head == NULL) {
        *head = new_node;
    } else {
        Node *cur = *head;
        while (cur->next) {
            cur = cur->next;
        }
        cur->next = new_node;
    }
    printf("Added: %s\n", item);
}

static void remove_item(Node **head, const char *item)
{
    Node *cur = *head;
    Node *prev = NULL;
    while (cur) {
        if (strcmp(cur->item, item) == 0) {
            if (prev) {
                prev->next = cur->next;
            } else {
                *head = cur->next;
            }
            free(cur->item);
            free(cur);
            printf("Removed: %s\n", item);
            return;
        }
        prev = cur;
        cur = cur->next;
    }
    printf("Item not found: %s\n", item);
}

static void list_items(const Node *head)
{
    const Node *cur = head;
    size_t idx = 1;
    if (!cur) {
        puts("The list is empty.");
        return;
    }
    while (cur) {
        printf("%zu. %s\n", idx++, cur->item);
        cur = cur->next;
    }
}

static void free_list(Node *head)
{
    while (head) {
        Node *next = head->next;
        free(head->item);
        free(head);
        head = next;
    }
}

/* -------------------------------------------------------------------------- */
/* Utility: trim trailing newline and carriage‑return characters. */
static void strip_newline(char *s)
{
    size_t len = strlen(s);
    while (len && (s[len - 1] == '\n' || s[len - 1] == '\r')) {
        s[--len] = '\0';
    }
}

/* -------------------------------------------------------------------------- */
int main(void)
{
    Node *list = NULL;
    char line[LINE_MAX];

    puts("Simple Shopping List – type 'quit' to exit.");
    puts("Commands: add <item>, remove <item>, list, quit");

    while (1) {
        printf("> ");
        fflush(stdout);

        if (!fgets(line, sizeof(line), stdin)) {
            /* EOF (Ctrl‑D) */
            putchar('\n');
            break;
        }

        strip_newline(line);

        /* Skip empty lines */
        char *p = line;
        while (*p && isspace((unsigned char)*p)) ++p;
        if (*p == '\0')
            continue;

        /* Extract command */
        char *cmd = strtok(p, " ");
        if (!cmd)
            continue;

        /* The rest of the line (after the command) is the argument.
           It may contain spaces, so we fetch it manually. */
        char *arg = p + strlen(cmd);
        while (*arg && isspace((unsigned char)*arg)) ++arg;
        if (*arg == '\0')
            arg = NULL;   /* No argument supplied */

        if (strcmp(cmd, "add") == 0) {
            if (!arg) {
                puts("Error: 'add' requires an item name.");
                continue;
            }
            add_item(&list, arg);
        } else if (strcmp(cmd, "remove") == 0) {
            if (!arg) {
                puts("Error: 'remove' requires an item name.");
                continue;
            }
            remove_item(&list, arg);
        } else if (strcmp(cmd, "list") == 0) {
            list_items(list);
        } else if (strcmp(cmd, "quit") == 0) {
            break;
        } else {
            printf("Unknown command: %s\n", cmd);
        }
    }

    free_list(list);
    puts("Good‑bye!");
    return 0;
}