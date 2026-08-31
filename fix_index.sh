sed -i '/export { default as PaginationControls }/d' apps/web/src/lib/components/data-grid/index.ts
sed -i '/export { default as PageSizeSelect }/d' apps/web/src/lib/components/data-grid/index.ts
sed -i '/export { default as ColumnHeader }/d' apps/web/src/lib/components/data-grid/index.ts
sed -i '/export { default as RowSelectHeader }/d' apps/web/src/lib/components/data-grid/index.ts
sed -i '/export { default as RowSelectCell }/d' apps/web/src/lib/components/data-grid/index.ts
sed -i '/export { default as GridCell }/d' apps/web/src/lib/components/data-grid/index.ts
sed -i '/export \* from '\''.\/hooks\/create-grid-form.js'\''/i export * from '\''.\/hooks\/use-data-grid.js'\''' apps/web/src/lib/components/data-grid/index.ts
