// The garden tools live in a collapsed edge menu; stage controls stay direct.
export async function gardenAction(page,name){
  const button=page.getByRole('button',{name,exact:true});
  if(!await button.isVisible()){
    const toggle=page.locator('#garden-menu-toggle');
    if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
  }
  await button.click();
}
