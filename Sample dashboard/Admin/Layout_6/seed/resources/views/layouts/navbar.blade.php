<!-- Main navbar -->
	<div class="navbar navbar-expand-xl navbar-static shadow">
		<div class="container-fluid">
			<div class="d-flex d-xl-none me-2">
				<button type="button" class="navbar-toggler sidebar-mobile-main-toggle rounded-pill">
					<i class="ph-list"></i>
				</button>
				<button type="button" class="navbar-toggler sidebar-mobile-secondary-toggle rounded-pill">
					<i class="ph-arrow-left"></i>
				</button>
			</div>

			<div class="navbar-brand flex-1 d-none d-sm-flex">
				<a href="index" class="d-inline-flex align-items-center">
					<img src="{{URL::asset('assets/images/logo_icon.svg')}}" alt="">
					<img src="{{URL::asset('assets/images/logo_text_dark.svg')}}" class="d-none d-sm-inline-block h-16px invert-dark ms-3" alt="">
				</a>
			</div>

			<div class="d-flex w-100 w-xl-auto overflow-auto overflow-xl-visible scrollbar-hidden border-top border-top-xl-0 order-1 order-xl-0 pt-2 pt-xl-0 mt-2 mt-xl-0">
				<ul class="nav gap-1 justify-content-center flex-nowrap flex-xl-wrap mx-auto">
					<li class="nav-item">
						<a href="index" class="navbar-nav-link rounded">
							Home
						</a>
					</li>

					<li class="nav-item nav-item-dropdown">
						<a href="#" class="navbar-nav-link dropdown-toggle rounded active" data-bs-toggle="dropdown" data-bs-auto-close="outside">
							Navigation
						</a>

						<div class="dropdown-menu p-0">
							<div class="d-xl-flex">
								<div class="d-flex flex-row flex-xl-column bg-light overflow-auto overflow-xl-visible rounded-top rounded-top-xl-0 rounded-start-xl">
									<div class="flex-1 border-bottom border-bottom-xl-0 p-2 p-xl-3">
										<div class="fw-bold border-bottom d-none d-xl-block pb-2 mb-2">Navigation</div>
										<ul class="nav nav-pills flex-xl-column flex-nowrap text-nowrap justify-content-center wmin-xl-300" role="tablist">
											<li class="nav-item" role="presentation">
												<a href="#tab_section_active" class="nav-link rounded active" data-bs-toggle="tab" aria-selected="true" role="tab">
													<i class="ph-layout me-2"></i>
													Active section
													<i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
												</a>
											</li>
											<li class="nav-item" role="presentation">
												<a href="#tab_section_inactive" class="nav-link rounded" data-bs-toggle="tab" aria-selected="false" tabindex="-1" role="tab">
													<i class="ph-rows me-2"></i>
													Inactive section
													<i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
												</a>
											</li>
											<li class="nav-item" role="presentation">
												<a href="#tab_section_disabled" class="nav-link disabled rounded" data-bs-toggle="tab" aria-selected="false" tabindex="-1" role="tab">
													<i class="ph-columns me-2"></i>
													Disabled section
													<i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
												</a>
											</li>
										</ul>
									</div>
								</div>

								<div class="tab-content flex-xl-1">
									<div class="tab-pane dropdown-scrollable-xl fade show active p-3" id="tab_section_active" role="tabpanel">
										<div class="row">
											<div class="col-lg-4 mb-3 mb-lg-0">
												<div class="fw-bold border-bottom pb-2 mb-2">Sections</div>
												<a href="layout_no_header" class="dropdown-item rounded">No header</a>
												<a href="layout_no_footer" class="dropdown-item rounded">No footer</a>
												<a href="layout_fixed_header" class="dropdown-item rounded">Fixed header</a>
												<a href="layout_fixed_footer" class="dropdown-item rounded">Fixed footer</a>
											</div>

											<div class="col-lg-4 mb-3 mb-lg-0">
												<div class="fw-bold border-bottom pb-2 mb-2">Sidebars</div>
												<a href="layout_2_sidebars_1_side" class="dropdown-item rounded active">2 sidebars on 1 side</a>
												<a href="layout_2_sidebars_2_sides" class="dropdown-item rounded">2 sidebars on 2 sides</a>
												<a href="layout_3_sidebars" class="dropdown-item rounded">3 sidebars</a>
											</div>

											<div class="col-lg-4">
												<div class="fw-bold border-bottom pb-2 mb-2">Layout</div>
												<a href="layout_static" class="dropdown-item rounded">Static layout</a>
												<a href="layout_boxed_page" class="dropdown-item rounded">Boxed page</a>
												<a href="layout_liquid_content" class="dropdown-item rounded">Liquid content</a>
											</div>
										</div>
									</div>

									<div class="tab-pane dropdown-scrollable-xl fade p-3" id="tab_section_inactive" role="tabpanel">
										<div class="row">
											<div class="col-lg-3 mb-3 mb-lg-0">
												<div class="fw-bold border-bottom pb-2 mb-2">Column 1 title</div>
												<a href="#" class="dropdown-item rounded">Column 1 item 1</a>
												<a href="#" class="dropdown-item rounded">Column 1 item 2</a>
												<a href="#" class="dropdown-item rounded">Column 1 item 3</a>
												<a href="#" class="dropdown-item rounded">Column 1 item 4</a>
											</div>

											<div class="col-lg-3 mb-3 mb-lg-0">
												<div class="fw-bold border-bottom pb-2 mb-2">Column 2 title</div>
												<a href="#" class="dropdown-item rounded">Column 2 item 1</a>
												<a href="#" class="dropdown-item rounded">Column 2 item 2</a>
												<a href="#" class="dropdown-item rounded">Column 2 item 3</a>
												<a href="#" class="dropdown-item rounded">Column 2 item 4</a>
											</div>

											<div class="col-lg-3 mb-3 mb-lg-0">
												<div class="fw-bold border-bottom pb-2 mb-2">Column 3 title</div>
												<a href="#" class="dropdown-item rounded">Column 3 item 1</a>
												<a href="#" class="dropdown-item rounded">Column 3 item 2</a>
												<a href="#" class="dropdown-item rounded">Column 3 item 3</a>
												<a href="#" class="dropdown-item rounded">Column 3 item 4</a>
											</div>

											<div class="col-lg-3">
												<div class="fw-bold border-bottom pb-2 mb-2">Column 4 title</div>
												<a href="#" class="dropdown-item rounded">Column 4 item 1</a>
												<a href="#" class="dropdown-item rounded">Column 4 item 2</a>
												<a href="#" class="dropdown-item rounded">Column 4 item 3</a>
												<a href="#" class="dropdown-item rounded">Column 4 item 4</a>
											</div>
										</div>
									</div>

									<div class="tab-pane dropdown-scrollable-xl fade p-3" id="tab_section_disabled" role="tabpanel">
										Disabled tab content
									</div>
								</div>
							</div>
						</div>
					</li>

					<li class="nav-item nav-item-dropdown-xl dropdown">
						<a href="#" class="navbar-nav-link dropdown-toggle rounded" data-bs-toggle="dropdown">
							Dropdown
						</a>

						<div class="dropdown-menu">
							<a href="#" class="dropdown-item">Menu item 1</a>
							<a href="#" class="dropdown-item">Menu item 2</a>
							<a href="#" class="dropdown-item">Menu item 3</a>
							<div class="dropdown-divider"></div>
							<a href="#" class="dropdown-item">Menu item 4</a>
						</div>
					</li>

					<li class="nav-item nav-item-dropdown-xl dropdown">
						<a href="#" class="navbar-nav-link dropdown-toggle rounded" data-bs-toggle="dropdown">
							Menu levels
						</a>

						<div class="dropdown-menu dropdown-menu-end">
							<div class="dropdown-header">Header</div>
							<a href="#" class="dropdown-item">Item 1</a>
							<div class="dropdown-submenu dropdown-submenu-start">
								<a href="#" class="dropdown-item dropdown-toggle">Item 2</a>
								<div class="dropdown-menu">
									<a href="#" class="dropdown-item">Item 1.1</a>
									<a href="#" class="dropdown-item">Item 1.2</a>
									<div class="dropdown-submenu dropdown-submenu-start">
										<a href="#" class="dropdown-item dropdown-toggle">Item 1.3</a>
										<div class="dropdown-menu">
											<a href="#" class="dropdown-item">Item 1.3.1</a>
											<a href="#" class="dropdown-item">Item 1.3.2</a>
										</div>
									</div>
									<div class="dropdown-submenu dropdown-submenu-start">
										<a href="#" class="dropdown-item dropdown-toggle">Item 1.4</a>
										<div class="dropdown-menu">
											<a href="#" class="dropdown-item">Item 1.4.1</a>
											<a href="#" class="dropdown-item">Item 1.4.2</a>
										</div>
									</div>
									<a href="#" class="dropdown-item">Item 1.5</a>
								</div>
							</div>
							<div class="dropdown-header">Header</div>
							<a href="#" class="dropdown-item">Item 3</a>
						</div>
					</li>
				</ul>
			</div>

			<ul class="nav gap-1 flex-xl-1 justify-content-end order-0 order-xl-1">
				<li class="nav-item nav-item-dropdown-xl dropdown">
					<a href="#" class="navbar-nav-link navbar-nav-link-icon rounded">
						<i class="ph-squares-four"></i>
					</a>
				</li>

				<li class="nav-item">
					<a href="#" class="navbar-nav-link navbar-nav-link-icon rounded">
						<i class="ph-bell"></i>
						<span class="badge bg-yellow text-black position-absolute top-0 end-0 translate-middle-top zindex-1 rounded-pill mt-1 me-1">2</span>
					</a>
				</li>

				<li class="nav-item nav-item-dropdown-xl dropdown">
					<a href="#" class="navbar-nav-link align-items-center rounded p-1" data-bs-toggle="dropdown">
						<div class="status-indicator-container">
							<img src="@if (Auth::user()->avatar != ''){{ URL::asset('images/' . Auth::user()->avatar) }}@else{{ URL::asset('assets/images/users/avatar-1.jpg') }}@endif" class="w-32px h-32px rounded-pill" alt="">
							<span class="status-indicator bg-success"></span>
						</div>
						<span class="d-none d-md-inline-block mx-md-2">{{Auth::user()->name}}</span>
					</a>

					<div class="dropdown-menu dropdown-menu-end">
						<a href="#" class="dropdown-item">Action</a>
						<a href="#" class="dropdown-item">Another action</a>
						<a href="#" class="dropdown-item">Something else here</a>
						<a href="#" class="dropdown-item">One more line</a>
						<a class="dropdown-item" href="{{ route('logout') }}" onclick="event.preventDefault();
	                                                     document.getElementById('logout-form').submit();">
	                        {{ __('Logout') }}
	                        </a>

	                        <form id="logout-form" action="{{ route('logout') }}" method="POST" class="d-none">
	                            @csrf
	                        </form>
					</div>
				</li>
			</ul>
		</div>
	</div>
	<!-- /main navbar -->